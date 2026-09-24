import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getDictionary } from "@/lib/i18n/server";
import { listMembershipsForUser } from "@/lib/domain/memberships/repository";
import { findResidencesByIds } from "@/lib/domain/residences/repository";
import { findUserById } from "@/lib/domain/users/service";
import { buildAccountWorkbook } from "@/lib/export/account-workbook";

/**
 * GET /api/exports/account[?ids=a,b] — downloads the signed-in user's data
 * as an .xlsx: every residence they belong to, or only the listed ones.
 * Ids the user is not a member of are ignored, never exported.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  const user = userId ? await findUserById(userId).catch(() => null) : null;
  if (!userId || !user || user.sessionVersion !== (session?.user.sessionVersion ?? 0)) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const memberOf = (await listMembershipsForUser(userId)).map((m) => m.residenceId);
  const requested = request.nextUrl.searchParams.get("ids");
  const wanted = requested ? requested.split(",").filter((id) => memberOf.includes(id)) : memberOf;
  if (requested && wanted.length === 0) {
    return NextResponse.json({ error: "No residence selected" }, { status: 400 });
  }

  const { locale } = await getDictionary();
  const residences = await findResidencesByIds(wanted);
  const file = await buildAccountWorkbook(residences, locale);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="resido-export-${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
