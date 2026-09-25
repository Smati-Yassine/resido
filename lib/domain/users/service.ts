import { ObjectId, type ClientSession } from "mongodb";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";
import { fromObjectId } from "@/lib/db/ids";
import { newTimestamps } from "@/lib/db/timestamps";
import { emailSchema, nonEmptyStringSchema } from "@/lib/validation/primitives";

/**
 * Accounts are global: one person signs in once and reaches every residence
 * they hold a membership in (lib/domain/memberships). Nothing tenant-scoped
 * lives on the user document.
 *
 * `sessionVersion` is copied into the login token at sign-in and compared on
 * every signed-in request (lib/session#requireUser): bumping it ends every
 * existing session at once ("sign out of all devices", password change).
 */
interface UserDoc {
  _id: ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  status: "ACTIVE" | "DISABLED";
  sessionVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  sessionVersion: number;
}

// 10 rounds (OWASP's minimum) keeps a sign-in near 100 ms with bcryptjs; 12 took
// about 300 ms, more on serverless CPUs. Hashes carry their own cost, so
// passwords saved at 12 still verify.
const BCRYPT_COST = 10;

const passwordSchema = z.string().min(8, "PASSWORD_TOO_SHORT").max(200);
const normalizedEmailSchema = z.string().trim().toLowerCase().pipe(emailSchema);

export const registerInputSchema = z.object({
  name: nonEmptyStringSchema.max(120),
  email: normalizedEmailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.input<typeof registerInputSchema>;

export const credentialsSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(1),
});

async function collection() {
  const db = await getDb();
  return db.collection<UserDoc>(COLLECTIONS.users);
}

function toDomain(doc: UserDoc): User {
  return {
    id: fromObjectId(doc._id),
    email: doc.email,
    name: doc.name,
    sessionVersion: doc.sessionVersion ?? 0,
  };
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === 11000;
}

export type RegisterResult =
  { ok: true; data: User } | { ok: false; code: "VALIDATION_ERROR" | "EMAIL_TAKEN"; message: string };

export async function registerUser(rawInput: RegisterInput): Promise<RegisterResult> {
  const parsed = registerInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const doc: UserDoc = {
    _id: new ObjectId(),
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash: await bcrypt.hash(parsed.data.password, BCRYPT_COST),
    status: "ACTIVE",
    sessionVersion: 0,
    ...newTimestamps(),
  };
  try {
    await (await collection()).insertOne(doc);
  } catch (error) {
    if (isDuplicateKey(error)) {
      return { ok: false, code: "EMAIL_TAKEN", message: "An account already exists for this email" };
    }
    throw error;
  }
  return { ok: true, data: toDomain(doc) };
}

/** Returns the user only when the email/password pair matches an ACTIVE account. */
export async function verifyCredentials(rawInput: unknown): Promise<User | null> {
  const parsed = credentialsSchema.safeParse(rawInput);
  if (!parsed.success) return null;
  const doc = await (await collection()).findOne({ email: parsed.data.email, status: "ACTIVE" });
  if (!doc?.passwordHash) return null;
  const valid = await bcrypt.compare(parsed.data.password, doc.passwordHash);
  return valid ? toDomain(doc) : null;
}

export async function findUserById(userId: string): Promise<User | null> {
  const doc = await (await collection()).findOne({ _id: new ObjectId(userId), status: "ACTIVE" });
  return doc ? toDomain(doc) : null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const doc = await (await collection()).findOne({ email: email.trim().toLowerCase(), status: "ACTIVE" });
  return doc ? toDomain(doc) : null;
}

export async function findUsersByIds(ids: string[]): Promise<User[]> {
  if (ids.length === 0) return [];
  const docs = await (await collection()).find({ _id: { $in: ids.map((id) => new ObjectId(id)) } }).toArray();
  return docs.map(toDomain);
}

/** Re-checks the password of a signed-in user before a sensitive account action. */
export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const doc = await (await collection()).findOne({ _id: new ObjectId(userId), status: "ACTIVE" });
  if (!doc?.passwordHash || !password) return false;
  return bcrypt.compare(password, doc.passwordHash);
}

export async function deleteUserDocument(userId: string, session: ClientSession): Promise<void> {
  await (await collection()).deleteOne({ _id: new ObjectId(userId) }, { session });
}

export type AccountUpdateResult =
  | { ok: true; data: User }
  | { ok: false; code: "VALIDATION_ERROR" | "WRONG_PASSWORD" | "EMAIL_TAKEN" | "PASSWORD_TOO_SHORT"; message: string };

/**
 * Renames the user and/or changes their email. A new email is a new sign-in
 * identity, so it requires the current password.
 */
export async function updateProfile(
  userId: string,
  input: { name: string; email: string; password?: string },
): Promise<AccountUpdateResult> {
  const name = nonEmptyStringSchema.max(120).safeParse(input.name);
  const email = normalizedEmailSchema.safeParse(input.email);
  if (!name.success || !email.success) return { ok: false, code: "VALIDATION_ERROR", message: "Invalid name or email" };

  const current = await findUserById(userId);
  if (!current) return { ok: false, code: "VALIDATION_ERROR", message: "User not found" };
  if (email.data !== current.email && !(await verifyPassword(userId, input.password ?? ""))) {
    return { ok: false, code: "WRONG_PASSWORD", message: "Wrong password" };
  }
  try {
    const updated = await (
      await collection()
    ).findOneAndUpdate(
      { _id: new ObjectId(userId) },
      { $set: { name: name.data, email: email.data, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return updated
      ? { ok: true, data: toDomain(updated) }
      : { ok: false, code: "VALIDATION_ERROR", message: "User not found" };
  } catch (error) {
    if (isDuplicateKey(error)) return { ok: false, code: "EMAIL_TAKEN", message: "Email already in use" };
    throw error;
  }
}

/** Changes the password and ends every other session (the caller re-signs the current one in). */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<AccountUpdateResult> {
  if (!passwordSchema.safeParse(newPassword).success) {
    return { ok: false, code: "PASSWORD_TOO_SHORT", message: "Password too short" };
  }
  if (!(await verifyPassword(userId, currentPassword)))
    return { ok: false, code: "WRONG_PASSWORD", message: "Wrong password" };
  const updated = await (
    await collection()
  ).findOneAndUpdate(
    { _id: new ObjectId(userId) },
    {
      $set: { passwordHash: await bcrypt.hash(newPassword, BCRYPT_COST), updatedAt: new Date() },
      $inc: { sessionVersion: 1 },
    },
    { returnDocument: "after" },
  );
  return updated
    ? { ok: true, data: toDomain(updated) }
    : { ok: false, code: "VALIDATION_ERROR", message: "User not found" };
}

/** Ends every session of this user, on every device. */
export async function endAllSessions(userId: string): Promise<void> {
  await (await collection()).updateOne({ _id: new ObjectId(userId) }, { $inc: { sessionVersion: 1 } });
}
