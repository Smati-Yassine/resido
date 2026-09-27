import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/dictionaries";
import { findUserById } from "@/lib/domain/users/service";
import { importResidence } from "@/lib/import/residence-import";
import { describeImportIssue, type ImportResponse } from "@/lib/import/describe";

/** Above this, the file is refused unread (the host's body limit is not far above). */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * POST /api/imports/residence — a "Whole residence" workbook (multipart
 * `file`, optional `name`) becomes a new residence of the signed-in user
 * (lib/import/residence-import.ts). A file with problems imports nothing and
 * gets them back, one sentence each. A route rather than a server action:
 * the file is larger than an action's body limit.
 */
export async function POST(request: NextRequest) {
  const { t, locale } = await getDictionary();
  const reply = (body: ImportResponse, status = 200) => NextResponse.json(body, { status });
  const refuse = (message: string, status: number, issues: string[] = []) =>
    reply({ ok: false, message, issues }, status);

  // Only this site's pages post here (the session cookie alone would let another site try).
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return refuse(t.errGeneric, 403);

  const session = await auth();
  const userId = session?.user?.id;
  const user = userId ? await findUserById(userId).catch(() => null) : null;
  if (!userId || !user || user.sessionVersion !== (session?.user.sessionVersion ?? 0)) {
    return refuse(t.errGeneric, 401);
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) {
    return refuse(t.importTooLarge, 413);
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return refuse(t.importNoFile, 400);
  if (file.size > MAX_BYTES) return refuse(t.importTooLarge, 413);
  const name = String(form?.get("name") ?? "").slice(0, 120);

  const result = await importResidence(userId, await file.arrayBuffer(), { name });
  if (!result.ok) {
    return refuse(
      t.importFailed,
      422,
      result.issues.map((issue) => describeImportIssue(issue, t, locale)),
    );
  }
  revalidatePath("/residences");
  const { residence, counts } = result;
  return reply({
    ok: true,
    slug: residence.slug,
    message: interpolate(t.imported, { name: residence.name, ...counts }),
  });
}
