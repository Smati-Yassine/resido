import { getDb } from "@/lib/db/client";
import { COLLECTIONS } from "@/lib/db/collections";

/**
 * Sign-in throttling: failed attempts are kept for WINDOW_MS (a TTL index
 * clears them, lib/db/collections.ts), and past a limit the next attempt is
 * refused before the password is even checked.
 *
 * - one email from one address: 5 failures — guessing a password;
 * - one address, any email: 30 failures — trying many accounts.
 *
 * Never one email from everywhere: a stranger could then lock anyone out by
 * typing their email wrong on purpose. In the database, not in memory: each
 * serverless instance has its own memory.
 */
const WINDOW_MS = 15 * 60 * 1000;
const PER_EMAIL_AND_IP = 5;
const PER_IP = 30;

type Failure = { key: string; at: Date };

async function failures() {
  return (await getDb()).collection<Failure>(COLLECTIONS.loginFailures);
}

const keys = (email: string, ip: string) => ({ pair: `pair:${ip}:${email.trim().toLowerCase()}`, ip: `ip:${ip}` });

/** Whether this email may try to sign in from this address now. */
export async function signInAllowed(email: string, ip: string): Promise<boolean> {
  const { pair, ip: address } = keys(email, ip);
  const since = new Date(Date.now() - WINDOW_MS);
  const collection = await failures();
  const [forPair, forIp] = await Promise.all([
    collection.countDocuments({ key: pair, at: { $gt: since } }),
    collection.countDocuments({ key: address, at: { $gt: since } }),
  ]);
  return forPair < PER_EMAIL_AND_IP && forIp < PER_IP;
}

/** Counts a wrong password (or an unknown email). */
export async function recordFailure(email: string, ip: string): Promise<void> {
  const { pair, ip: address } = keys(email, ip);
  const at = new Date();
  await (await failures()).insertMany([
    { key: pair, at },
    { key: address, at },
  ]);
}

/** A right password clears this email's count from this address. */
export async function clearFailures(email: string, ip: string): Promise<void> {
  await (await failures()).deleteMany({ key: keys(email, ip).pair });
}

/** The client's address as the host reports it (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
