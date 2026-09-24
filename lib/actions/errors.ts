import { ForbiddenError } from "@/lib/rbac/permissions";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { ActionResult } from "@/lib/action-result";

/**
 * Runs a Server Action body and turns an authorization failure into a toast
 * message instead of an error page. Anything else is a bug and is rethrown.
 */
export async function guarded<T>(t: Dictionary, body: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await body();
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, message: t.errForbidden };
    throw error;
  }
}

export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}
