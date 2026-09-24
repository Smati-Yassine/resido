"use server";

import { revalidatePath } from "next/cache";
import { interpolate } from "@/lib/i18n/dictionaries";
import { getDictionary } from "@/lib/i18n/server";
import { requireResidenceSession } from "@/lib/session";
import { formatAmount } from "@/lib/format";
import { CURRENCIES, DEFAULT_CURRENCY, fitsCurrency, type CurrencyCode } from "@/lib/currency";
import { findResidenceById } from "@/lib/domain/residences/repository";
import { fromDecimalString, MoneyError } from "@/lib/money";
import * as buildings from "@/lib/domain/buildings/service";
import * as lots from "@/lib/domain/lots/service";
import * as cycles from "@/lib/domain/cycles/service";
import * as payments from "@/lib/domain/payments/service";
import * as expenses from "@/lib/domain/expenses/service";
import * as owners from "@/lib/domain/owners/service";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/domain/payments/schema";
import type { ActionResult } from "@/lib/action-result";
import { field, guarded } from "./errors";

/** Every workspace action is scoped to the residence named in the form and re-renders its pages. */
async function scoped(formData: FormData) {
  const residenceId = field(formData, "residenceId");
  const session = await requireResidenceSession(residenceId);
  const { t } = await getDictionary();
  const currency = (await findResidenceById(residenceId))?.currency ?? DEFAULT_CURRENCY;
  const done = (message: string): ActionResult => {
    revalidatePath(`/residences/${residenceId}`, "layout");
    return { ok: true, message };
  };
  /** Amount with the residence's currency symbol, for toast messages. */
  const money = (millimes: number) => formatAmount(millimes, currency);
  /** An example amount with the currency's decimals, for error messages ("480.000" / "480.00"). */
  const example = (units: number) => units.toFixed(CURRENCIES[currency].decimals);
  return { residenceId, session, t, done, currency, money, example };
}

/**
 * A decimal-string amount in millimes, or null if it is not a valid positive
 * amount — or has more decimals than the residence's currency allows.
 */
function parseAmount(raw: string, currency: CurrencyCode, allowZero = false): number | null {
  try {
    const value = fromDecimalString(raw.replace(",", "."));
    if (!fitsCurrency(value, currency)) return null;
    return value > 0 || (allowZero && value === 0) ? value : null;
  } catch (error) {
    if (error instanceof MoneyError) return null;
    throw error;
  }
}

export async function createBlocAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { residenceId, session, t, done } = await scoped(formData);
  const name = field(formData, "name");
  return guarded(t, async () => {
    if (!name) return { ok: false, message: t.errBlocName };
    const result = await buildings.createBuilding(session, residenceId, { name });
    if (!result.ok) {
      return {
        ok: false,
        message: result.code === "DUPLICATE_NAME" ? interpolate(t.errBlocDuplicate, { name }) : t.errBlocName,
      };
    }
    return done(interpolate(t.blocCreated, { name: result.data.name }));
  });
}

export async function createLotAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { residenceId, session, t, done, currency, money, example } = await scoped(formData);
  const code = field(formData, "code");
  const buildingId = field(formData, "buildingId");
  const charge = parseAmount(field(formData, "charge"), currency);
  return guarded(t, async () => {
    if (!code) return { ok: false, message: t.errLotCode };
    if (!buildingId) return { ok: false, message: t.errPickBloc };
    if (charge === null) return { ok: false, message: interpolate(t.errLotCharge, { example: example(1209.76) }) };
    const result = await lots.createLot(session, residenceId, {
      buildingId,
      ownerId: field(formData, "ownerId") || undefined,
      code,
      chargeMillimes: field(formData, "charge").replace(",", "."),
    });
    if (!result.ok) {
      if (result.code === "DUPLICATE_CODE") return { ok: false, message: interpolate(t.errLotDuplicate, { code }) };
      return {
        ok: false,
        message:
          result.code === "NOT_FOUND" ? t.errPickBloc : interpolate(t.errLotCharge, { example: example(1209.76) }),
      };
    }
    return done(interpolate(t.lotCreated, { code, amount: money(result.data.chargeMillimes) }));
  });
}

export async function recordPaymentAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { residenceId, session, t, done, currency, money, example } = await scoped(formData);
  return guarded(t, async () => {
    let allocations: { assessmentId: string; amount: string; code: string; remaining: number }[];
    try {
      allocations = JSON.parse(field(formData, "allocations") || "[]");
    } catch {
      return { ok: false, message: t.errPickLot };
    }
    if (allocations.length === 0) return { ok: false, message: t.errPickLot };
    const partial: string[] = [];
    for (const a of allocations) {
      const amount = parseAmount(a.amount, currency);
      if (amount === null) return { ok: false, message: interpolate(t.errAmountFor, { code: a.code }) };
      if (amount > a.remaining) {
        return { ok: false, message: interpolate(t.errAmountExceeds, { code: a.code, amount: money(a.remaining) }) };
      }
      if (amount < a.remaining) partial.push(a.code);
    }
    const method = field(formData, "method") as PaymentMethod;
    const result = await payments.recordPayment(session, residenceId, {
      ownerId: field(formData, "ownerId") || undefined,
      payerName: field(formData, "payer") || undefined,
      date: field(formData, "date"),
      method: PAYMENT_METHODS.includes(method) ? method : "CASH",
      note: field(formData, "note") || undefined,
      idempotencyKey: field(formData, "idempotencyKey"),
      allocations: allocations.map((a) => ({
        assessmentId: a.assessmentId,
        amountMillimes: a.amount.replace(",", "."),
      })),
    });
    if (!result.ok) {
      if (result.code === "CYCLE_NOT_OPEN") return { ok: false, message: t.errCycleNotOpen };
      if (result.code === "OVER_ALLOCATION")
        return { ok: false, message: interpolate(t.errAmount, { example: example(480) }) };
      return { ok: false, message: t.errGeneric };
    }
    let message = interpolate(t.paymentRecorded, { amount: money(result.data.amountMillimes) });
    if (partial.length) message += interpolate(t.paymentPartial, { lots: partial.join(", ") });
    return done(message);
  });
}

export async function recordExpenseAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { residenceId, session, t, done, currency, money, example } = await scoped(formData);
  const label = field(formData, "label");
  const rawAmount = field(formData, "amount").replace(",", ".");
  return guarded(t, async () => {
    if (!label) return { ok: false, message: t.errExpLabel };
    if (parseAmount(rawAmount, currency) === null)
      return { ok: false, message: interpolate(t.errAmount, { example: example(480) }) };
    const result = await expenses.recordExpense(session, residenceId, {
      label,
      amountMillimes: rawAmount,
      reference: field(formData, "reference") || undefined,
      date: field(formData, "date"),
      idempotencyKey: field(formData, "idempotencyKey"),
    });
    if (!result.ok) return { ok: false, message: result.code === "CYCLE_NOT_OPEN" ? t.errCycleNotOpen : t.errGeneric };
    return done(interpolate(t.expenseRecorded, { amount: money(result.data.amountMillimes) }));
  });
}

export async function setOpeningBalanceAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { residenceId, session, t, done, currency, money, example } = await scoped(formData);
  const raw = field(formData, "amount").replace(",", ".");
  return guarded(t, async () => {
    const amount = parseAmount(raw, currency, true);
    if (amount === null) return { ok: false, message: interpolate(t.errStart, { example: example(2204.33) }) };
    const result = await cycles.setOpeningBalance(session, residenceId, {
      cycleId: field(formData, "cycleId"),
      openingTreasuryBalanceMillimes: raw,
    });
    if (!result.ok)
      return {
        ok: false,
        message:
          result.code === "CONFLICT" ? t.errCycleNotOpen : interpolate(t.errStart, { example: example(2204.33) }),
      };
    return done(interpolate(t.startSaved, { amount: money(amount) }));
  });
}

export async function createCycleAction(
  _: ActionResult<{ id: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  const { residenceId, session, t } = await scoped(formData);
  const name = field(formData, "name");
  const startDate = field(formData, "startDate");
  const endDate = field(formData, "endMode") === "fixed" ? field(formData, "endDate") : "";
  return guarded(t, async () => {
    if (!name) return { ok: false, message: t.errCycleName };
    if (!startDate) return { ok: false, message: t.errCycleStart };
    const result = await cycles.createCycle(session, residenceId, { name, startDate, endDate: endDate || undefined });
    if (!result.ok) return { ok: false, message: t.errCycleDates };
    revalidatePath(`/residences/${residenceId}`, "layout");
    return { ok: true, message: interpolate(t.cycleCreated, { name }), data: { id: result.data.id } };
  });
}

export async function openCycleAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { residenceId, session, t, done } = await scoped(formData);
  return guarded(t, async () => {
    const result = await cycles.openCycle(session, residenceId, { cycleId: field(formData, "cycleId") });
    if (!result.ok)
      return { ok: false, message: result.code === "ANOTHER_CYCLE_OPEN" ? t.errAnotherOpen : t.errGeneric };
    const lotCount = await lots.listLots(session, residenceId, { status: "ACTIVE" });
    return done(interpolate(t.cycleOpened, { name: result.data.name, count: lotCount.ok ? lotCount.data.length : 0 }));
  });
}

export async function closeCycleAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { residenceId, session, t, done, money } = await scoped(formData);
  return guarded(t, async () => {
    const result = await cycles.closeCycle(session, residenceId, { cycleId: field(formData, "cycleId") });
    if (!result.ok) return { ok: false, message: t.errCycleNotOpen };
    return done(
      interpolate(t.cycleClosed, {
        name: result.data.name,
        amount: money(result.data.closingTreasuryBalanceMillimes ?? 0),
      }),
    );
  });
}

export async function deleteCycleAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { residenceId, session, t, done } = await scoped(formData);
  return guarded(t, async () => {
    const result = await cycles.deleteCycle(session, residenceId, { cycleId: field(formData, "cycleId") });
    if (!result.ok) return { ok: false, message: t.errGeneric };
    return done(interpolate(t.cycleDeleted, { name: result.data.name }));
  });
}

function ownerInput(formData: FormData) {
  return {
    name: field(formData, "name"),
    phone: field(formData, "phone") || undefined,
    lotIds: formData.getAll("lotIds").map(String),
  };
}

export async function saveOwnerAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { residenceId, session, t, done } = await scoped(formData);
  const ownerId = field(formData, "ownerId");
  const input = ownerInput(formData);
  return guarded(t, async () => {
    if (!input.name) return { ok: false, message: t.errOwnerName };
    const result = ownerId
      ? await owners.updateOwner(session, residenceId, ownerId, input)
      : await owners.createOwner(session, residenceId, input);
    if (!result.ok) return { ok: false, message: t.errGeneric };
    return done(
      interpolate(ownerId ? t.ownerUpdated : t.ownerCreated, { name: result.data.name, count: input.lotIds.length }),
    );
  });
}

export async function deleteOwnerAction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { residenceId, session, t, done } = await scoped(formData);
  return guarded(t, async () => {
    const result = await owners.deleteOwner(session, residenceId, field(formData, "ownerId"));
    if (!result.ok) return { ok: false, message: t.errGeneric };
    return done(interpolate(t.ownerDeleted, { name: result.data.name }));
  });
}

/** Called directly (not from a form) by the owner dropdown on each lot row. */
export async function setLotOwnerAction(
  residenceId: string,
  lot: { id: string; code: string },
  owner: { id: string; name: string } | null,
): Promise<ActionResult> {
  const session = await requireResidenceSession(residenceId);
  const { t } = await getDictionary();
  return guarded(t, async () => {
    const result = await lots.setLotOwner(session, residenceId, { lotId: lot.id, ownerId: owner?.id ?? null });
    if (!result.ok) return { ok: false, message: t.errGeneric };
    revalidatePath(`/residences/${residenceId}`, "layout");
    return {
      ok: true,
      message: owner
        ? interpolate(t.lotOwnerSet, { code: lot.code, name: owner.name })
        : interpolate(t.lotOwnerCleared, { code: lot.code }),
    };
  });
}
