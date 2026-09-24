import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import type { Assessment } from "./schema";
import * as repo from "./repository";
import type { CycleAssessmentSummary } from "./repository";

export type Result<T> = { ok: true; data: T } | { ok: false; code: "VALIDATION_ERROR"; message: string };

export async function listAssessmentsForCycle(
  session: AuthorizedSession,
  organizationId: string,
  cycleId: string,
): Promise<Result<Assessment[]>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:read");
  return { ok: true, data: await repo.listAssessmentsForCycle(organizationId, cycleId) };
}

export async function listAssessmentsForLot(
  session: AuthorizedSession,
  organizationId: string,
  lotId: string,
): Promise<Result<Assessment[]>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:read");
  return { ok: true, data: await repo.listAssessmentsForLot(organizationId, lotId) };
}

export async function getCycleAssessmentSummary(
  session: AuthorizedSession,
  organizationId: string,
  cycleId: string,
): Promise<Result<CycleAssessmentSummary>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "cycles:read");
  return { ok: true, data: await repo.summarizeAssessmentsForCycle(organizationId, cycleId) };
}
