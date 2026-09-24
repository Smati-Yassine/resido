import { writeAuditLog } from "@/lib/audit/log";
import type { AuthorizedSession } from "@/lib/rbac/permissions";
import { requirePermission, requireOrganization } from "@/lib/rbac/permissions";
import { createBuildingInputSchema, type CreateBuildingInput, type Building } from "./schema";
import * as repo from "./repository";
import { DuplicateBuildingNameError } from "./repository";

export type Result<T> =
  { ok: true; data: T } | { ok: false; code: "VALIDATION_ERROR" | "DUPLICATE_NAME"; message: string };

export async function createBuilding(
  session: AuthorizedSession,
  organizationId: string,
  rawInput: CreateBuildingInput,
): Promise<Result<Building>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "lots:*");

  const parsed = createBuildingInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  try {
    const building = await repo.insertBuilding(organizationId, parsed.data);
    await writeAuditLog({
      organizationId,
      actorUserId: session.userId,
      action: "BLOC_CREATED",
      entityType: "bloc",
      entityId: building.id,
      metadata: { name: building.name },
    });
    return { ok: true, data: building };
  } catch (error) {
    if (error instanceof DuplicateBuildingNameError) {
      return { ok: false, code: "DUPLICATE_NAME", message: error.message };
    }
    throw error;
  }
}

export async function listBuildings(session: AuthorizedSession, organizationId: string): Promise<Result<Building[]>> {
  requireOrganization(session, organizationId);
  requirePermission(session, "lots:read");
  return { ok: true, data: await repo.listBuildings(organizationId) };
}
