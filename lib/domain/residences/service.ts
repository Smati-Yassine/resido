import type { AuthorizedSession, Role } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import { withTransaction } from "@/lib/db/transaction";
import { residenceInputSchema, type Residence, type ResidenceInput } from "./schema";
import * as repo from "./repository";
import * as membershipsRepo from "@/lib/domain/memberships/repository";
import * as lotsRepo from "@/lib/domain/lots/repository";
import * as buildingsRepo from "@/lib/domain/buildings/repository";
import * as cyclesRepo from "@/lib/domain/cycles/repository";
import * as assessmentsRepo from "@/lib/domain/assessments/repository";
import type { Cycle } from "@/lib/domain/cycles/schema";
import { CURRENCIES, isCurrencyCode } from "@/lib/currency";
import { writeAuditLog } from "@/lib/audit/log";

export type Result<T> =
  { ok: true; data: T } | { ok: false; code: "VALIDATION_ERROR" | "NOT_FOUND" | "CURRENCY_PRECISION"; message: string };

/**
 * Anyone signed in can create a residence; its creator becomes its
 * SYNDIC_ADMIN. The residence and the membership are written together so a
 * residence can never exist without someone able to open it.
 */
export async function createResidence(userId: string, rawInput: ResidenceInput): Promise<Result<Residence>> {
  const parsed = residenceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const residence = await withTransaction(async (dbSession) => {
    const created = await repo.insertResidence(parsed.data, dbSession);
    await membershipsRepo.insertMembership({ userId, residenceId: created.id, role: "SYNDIC_ADMIN" }, dbSession);
    return created;
  });
  return { ok: true, data: residence };
}

export async function getResidence(session: AuthorizedSession, residenceId: string): Promise<Result<Residence>> {
  requireOrganization(session, residenceId);
  const residence = await repo.findResidenceById(residenceId);
  if (!residence) return { ok: false, code: "NOT_FOUND", message: "Residence not found" };
  return { ok: true, data: residence };
}

export async function updateResidence(
  session: AuthorizedSession,
  residenceId: string,
  rawInput: ResidenceInput,
): Promise<Result<Residence>> {
  requireOrganization(session, residenceId);
  requirePermission(session, "*");
  const parsed = residenceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const residence = await repo.updateResidence(residenceId, { name: parsed.data.name, city: parsed.data.city });
  if (!residence) return { ok: false, code: "NOT_FOUND", message: "Residence not found" };
  await writeAuditLog({
    organizationId: residenceId,
    actorUserId: session.userId,
    action: "RESIDENCE_UPDATED",
    entityType: "residence",
    entityId: residenceId,
    metadata: { name: residence.name, city: residence.city },
  });
  return { ok: true, data: residence };
}

export async function setResidenceCurrency(
  session: AuthorizedSession,
  residenceId: string,
  currency: string,
): Promise<Result<Residence>> {
  requireOrganization(session, residenceId);
  requirePermission(session, "*");
  if (!isCurrencyCode(currency)) return { ok: false, code: "VALIDATION_ERROR", message: "Unknown currency" };
  if (!(await repo.amountsFitDecimals(residenceId, CURRENCIES[currency].decimals))) {
    return { ok: false, code: "CURRENCY_PRECISION", message: "Existing amounts have more decimals than this currency" };
  }
  const residence = await repo.setResidenceCurrency(residenceId, currency);
  if (!residence) return { ok: false, code: "NOT_FOUND", message: "Residence not found" };
  await writeAuditLog({
    organizationId: residenceId,
    actorUserId: session.userId,
    action: "RESIDENCE_UPDATED",
    entityType: "residence",
    entityId: residenceId,
    metadata: { currency },
  });
  return { ok: true, data: residence };
}

/** Archiving hides a residence from the active list; nothing is deleted and it can be restored. */
export async function setResidenceArchived(
  session: AuthorizedSession,
  residenceId: string,
  archived: boolean,
): Promise<Result<Residence>> {
  requireOrganization(session, residenceId);
  requirePermission(session, "*");
  const residence = await repo.updateResidence(residenceId, { status: archived ? "ARCHIVED" : "ACTIVE" });
  if (!residence) return { ok: false, code: "NOT_FOUND", message: "Residence not found" };
  await writeAuditLog({
    organizationId: residenceId,
    actorUserId: session.userId,
    action: archived ? "RESIDENCE_ARCHIVED" : "RESIDENCE_RESTORED",
    entityType: "residence",
    entityId: residenceId,
  });
  return { ok: true, data: residence };
}

/** Permanent: removes the residence and every document scoped to it, atomically. */
export async function deleteResidence(session: AuthorizedSession, residenceId: string): Promise<Result<null>> {
  requireOrganization(session, residenceId);
  requirePermission(session, "*");
  const deleted = await withTransaction((dbSession) => repo.deleteResidenceCascade(residenceId, dbSession));
  if (!deleted) return { ok: false, code: "NOT_FOUND", message: "Residence not found" };
  return { ok: true, data: null };
}

export interface ResidenceCard extends Residence {
  /** The viewer's role in this residence. */
  role: Role;
  lotCount: number;
  blocCount: number;
  /** The OPEN cycle, else the most recent one; null when the residence has no cycle yet. */
  currentCycle: Pick<Cycle, "id" | "name" | "status"> | null;
  /** Share of the current cycle's charges collected, 0–100; null without assessments. */
  collectionRate: number | null;
}

/** The home screen: every residence the user is a member of, with its headline figures. */
export async function listResidenceCards(userId: string): Promise<ResidenceCard[]> {
  const memberships = await membershipsRepo.listMembershipsForUser(userId);
  const residences = await repo.findResidencesByIds(memberships.map((m) => m.residenceId));
  const roleOf = new Map(memberships.map((m) => [m.residenceId, m.role]));

  return Promise.all(
    residences.map(async (residence): Promise<ResidenceCard> => {
      const [lots, blocs, cycles] = await Promise.all([
        lotsRepo.listLots(residence.id, { status: "ACTIVE" }),
        buildingsRepo.listBuildings(residence.id),
        cyclesRepo.listCycles(residence.id),
      ]);
      const current = cycles.find((c) => c.status === "OPEN") ?? cycles[0] ?? null;
      let collectionRate: number | null = null;
      if (current && current.status !== "DRAFT") {
        const summary = await assessmentsRepo.summarizeAssessmentsForCycle(residence.id, current.id);
        if (summary.totalAmountMillimes > 0) {
          collectionRate = Math.round((summary.totalPaidMillimes / summary.totalAmountMillimes) * 100);
        }
      }
      return {
        ...residence,
        role: roleOf.get(residence.id) ?? "VIEWER",
        lotCount: lots.length,
        blocCount: blocs.length,
        currentCycle: current ? { id: current.id, name: current.name, status: current.status } : null,
        collectionRate,
      };
    }),
  );
}
