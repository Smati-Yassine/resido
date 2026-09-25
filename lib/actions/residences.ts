"use server";

import { revalidatePath } from "next/cache";
import { interpolate } from "@/lib/i18n/dictionaries";
import { getDictionary } from "@/lib/i18n/server";
import { requireResidenceSession, requireUser } from "@/lib/session";
import * as residences from "@/lib/domain/residences/service";
import type { ActionResult } from "@/lib/action-result";
import { currencySymbol } from "@/lib/currency";
import { field, guarded } from "./errors";
import { findMembership } from "@/lib/domain/memberships/repository";
import { loadResidenceSettings, type ResidenceSettingsData } from "@/lib/settings/residence-settings";

export async function createResidenceAction(
  _: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  const { t } = await getDictionary();
  const user = await requireUser();
  const result = await residences.createResidence(user.userId, {
    name: field(formData, "name"),
    city: field(formData, "city"),
    currency: field(formData, "currency") || undefined,
  });
  if (!result.ok) return { ok: false, message: t.errResidenceName };
  revalidatePath("/residences");
  return {
    ok: true,
    message: interpolate(t.residenceCreated, { name: result.data.name }),
    data: { slug: result.data.slug },
  };
}

/** Renaming changes the residence's slug; `data.slug` lets the page move to its new URL. */
export async function updateResidenceAction(
  _: ActionResult<{ slug: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ slug: string }>> {
  const { t } = await getDictionary();
  const session = await requireResidenceSession(field(formData, "residenceId"));
  return guarded(t, async () => {
    const result = await residences.updateResidence(session, session.organizationId!, {
      name: field(formData, "name"),
      city: field(formData, "city"),
    });
    if (!result.ok) return { ok: false, message: t.errResidenceName };
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: interpolate(t.residenceUpdated, { name: result.data.name }),
      data: { slug: result.data.slug },
    };
  });
}

export async function setResidenceArchivedAction(residenceId: string, archived: boolean): Promise<ActionResult> {
  const { t } = await getDictionary();
  const session = await requireResidenceSession(residenceId);
  return guarded(t, async () => {
    const result = await residences.setResidenceArchived(session, residenceId, archived);
    if (!result.ok) return { ok: false, message: t.errGeneric };
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: interpolate(archived ? t.residenceArchived : t.residenceRestored, { name: result.data.name }),
    };
  });
}

export async function deleteResidenceAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { t } = await getDictionary();
  const residenceId = field(formData, "residenceId");
  const session = await requireResidenceSession(residenceId);
  return guarded(t, async () => {
    const existing = await residences.getResidence(session, residenceId);
    const result = await residences.deleteResidence(session, residenceId);
    if (!result.ok || !existing.ok) return { ok: false, message: t.errGeneric };
    revalidatePath("/residences");
    return { ok: true, message: interpolate(t.residenceDeleted, { name: existing.data.name }) };
  });
}

export async function setResidenceCurrencyAction(residenceId: string, currency: string): Promise<ActionResult> {
  const { t } = await getDictionary();
  const session = await requireResidenceSession(residenceId);
  return guarded(t, async () => {
    const result = await residences.setResidenceCurrency(session, residenceId, currency);
    if (!result.ok) {
      return { ok: false, message: result.code === "CURRENCY_PRECISION" ? t.errCurrencyPrecision : t.errGeneric };
    }
    revalidatePath("/residences/[residenceId]", "layout");
    const code = result.data.currency;
    return { ok: true, message: interpolate(t.currencySaved, { currency: `${code} (${currencySymbol(code)})` }) };
  });
}

/**
 * The residence settings as data, for the settings modal on the residences
 * list. Null when the user is no longer a member (they just left it, say).
 */
export async function loadResidenceSettingsAction(residenceId: string): Promise<ResidenceSettingsData | null> {
  const user = await requireUser();
  const membership = await findMembership(user.userId, residenceId).catch(() => null);
  if (!membership) return null;
  const { t, locale } = await getDictionary();
  const session = await requireResidenceSession(residenceId);
  return loadResidenceSettings(session, residenceId, t, locale);
}
