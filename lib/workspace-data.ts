import { cache } from "react";
import * as lots from "@/lib/domain/lots/service";
import { getLotRows } from "@/lib/domain/overview/service";
import type { AuthorizedSession } from "@/lib/rbac/permissions";

/**
 * Per-request memos for what both the residence layout and its pages read —
 * the layout's figures (lot count, unpaid badge) come for free to the page.
 * Apart from lib/workspace.ts (sessions, redirects) so the documents built
 * from them (lib/print/load.ts, the Excel exports) load without a request.
 */
export const lotRowsFor = cache((session: AuthorizedSession, residenceId: string, cycleId: string) =>
  getLotRows(session, residenceId, cycleId),
);
export const activeLotsFor = cache((session: AuthorizedSession, residenceId: string) =>
  lots.listLots(session, residenceId, { status: "ACTIVE" }),
);
