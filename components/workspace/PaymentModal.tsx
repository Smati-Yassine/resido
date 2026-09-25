"use client";

import { Fragment, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { useActionToast } from "@/components/ui/useActionToast";
import { recordPaymentAction } from "@/lib/actions/workspace";
import { interpolate } from "@/lib/i18n/dictionaries";
import { formatAmount, formatMoney, toInputAmount, todayIso } from "@/lib/format";
import { useCurrency } from "@/components/ui/CurrencyProvider";
import { fitsCurrency, type CurrencyCode } from "@/lib/currency";
import { fromDecimalString, millimes, toDecimalString } from "@/lib/money";
import { PAYMENT_METHODS } from "@/lib/domain/payments/schema";
import { ModalButton } from "./ModalButton";
import { ModalActions } from "./ModalActions";

/** A lot that still owes something in the open cycle. */
export interface OutstandingLot {
  assessmentId: string;
  code: string;
  bloc: string;
  ownerId: string | null;
  ownerName: string | null;
  remainingMillimes: number;
  partlyPaid: boolean;
}

function parse(raw: string, currency: CurrencyCode): number | null {
  try {
    const value = fromDecimalString(raw.replace(",", "."));
    return value > 0 && fitsCurrency(value, currency) ? value : null;
  } catch {
    return null;
  }
}

export function PaymentButton({
  residenceId,
  lots,
  label,
}: {
  residenceId: string;
  lots: OutstandingLot[];
  label?: string;
}) {
  const { t } = useI18n();
  return (
    <ModalButton label={label ?? t.newPayment}>
      {(close) => <PaymentModal residenceId={residenceId} lots={lots} onClose={close} />}
    </ModalButton>
  );
}

const MAX_RESULTS = 6;

/**
 * Recording a payment starts from a unit: search it by code and it is added,
 * selected for its full remaining due. The payer is that unit's owner (set by
 * the server), and the owner's other unpaid units are offered right below,
 * unselected, for when they settle several at once.
 */
function PaymentModal({
  residenceId,
  lots: allLots,
  onClose,
}: {
  residenceId: string;
  lots: OutstandingLot[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { code: currency, symbol } = useCurrency();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [query, setQuery] = useState("");
  // Units found by search, in the order they were added.
  const [picked, setPicked] = useState<string[]>([]);
  // Selected units and their typed amounts; no typed amount = the full remaining due.
  const [amounts, setAmounts] = useState<Record<string, string | null>>({});

  const byId = new Map(allLots.map((l) => [l.assessmentId, l]));
  const pickedLots = picked.map((id) => byId.get(id)!).filter(Boolean);
  // The same owners' other unpaid units, offered unselected.
  const ownerIds = new Set(pickedLots.map((l) => l.ownerId).filter(Boolean));
  const siblings = allLots.filter((l) => l.ownerId && ownerIds.has(l.ownerId) && !picked.includes(l.assessmentId));
  const shown = [...pickedLots, ...siblings];

  const needle = query.trim().toLowerCase();
  const results = needle
    ? allLots
        .filter((l) => !shown.includes(l) && l.code.toLowerCase().includes(needle))
        .sort(
          (a, b) => Number(!a.code.toLowerCase().startsWith(needle)) - Number(!b.code.toLowerCase().startsWith(needle)),
        )
        .slice(0, MAX_RESULTS)
    : [];

  const add = (lot: OutstandingLot) => {
    setPicked((current) => [...current, lot.assessmentId]);
    setAmounts((current) => ({ ...current, [lot.assessmentId]: null }));
    setQuery("");
  };

  const selected = shown.filter((l) => l.assessmentId in amounts);
  const amountOf = (lot: OutstandingLot) => {
    const typed = amounts[lot.assessmentId];
    return typed == null ? lot.remainingMillimes : parse(typed, currency);
  };
  const total = selected.reduce((sum, l) => sum + (amountOf(l) ?? 0), 0);

  const toggle = (lot: OutstandingLot) =>
    setAmounts((current) => {
      const next = { ...current };
      if (lot.assessmentId in next) delete next[lot.assessmentId];
      else next[lot.assessmentId] = null;
      return next;
    });

  // Checked client-side for an instant message; the server checks again.
  const prepare = (formData: FormData): boolean => {
    if (selected.length === 0) {
      toast({ tone: "danger", text: t.errPickLot });
      return false;
    }
    for (const lot of selected) {
      const value = amountOf(lot);
      if (value === null) {
        toast({ tone: "danger", text: interpolate(t.errAmountFor, { code: lot.code }) });
        return false;
      }
      if (value > lot.remainingMillimes) {
        toast({
          tone: "danger",
          text: interpolate(t.errAmountExceeds, {
            code: lot.code,
            amount: formatAmount(lot.remainingMillimes, currency),
          }),
        });
        return false;
      }
    }
    formData.set(
      "allocations",
      JSON.stringify(
        selected.map((lot) => ({
          assessmentId: lot.assessmentId,
          code: lot.code,
          remaining: lot.remainingMillimes,
          amount: toDecimalString(millimes(amountOf(lot)!)),
        })),
      ),
    );
    return true;
  };
  const [submit, pending] = useActionToast(recordPaymentAction, onClose, prepare);

  return (
    <Modal title={t.newPayment} subtitle={t.payHelp} width={720} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <input type="hidden" name="residenceId" value={residenceId} />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

        <div className="grid grid-cols-2 gap-3">
          <Field label={t.method}>
            <select className="input" name="method" defaultValue="CASH">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t[`method${m}`]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.date}>
            <input className="input" type="date" name="date" defaultValue={todayIso()} required />
          </Field>
        </div>

        <div className="relative flex flex-col gap-1.5">
          <Field label={t.searchLot}>
            <span className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                <Icon name="search" size={17} />
              </span>
              <input
                className="input pl-10"
                type="search"
                value={query}
                autoComplete="off"
                placeholder={allLots.length ? t.searchLotPlaceholder : t.allPaid}
                disabled={allLots.length === 0}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Enter adds the best match instead of submitting the form.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (results[0]) add(results[0]);
                  }
                }}
              />
            </span>
          </Field>
          {needle && (
            <div className="popover absolute inset-x-0 top-[78px] z-10 flex flex-col gap-0.5" role="listbox">
              {results.length === 0 ? (
                <span className="px-3 py-2.5 text-sm text-muted">{t.noLotMatch}</span>
              ) : (
                results.map((lot) => (
                  <button
                    key={lot.assessmentId}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="menu-item py-2.5"
                    onClick={() => add(lot)}
                  >
                    <span className="flex flex-col">
                      <span className="text-sm font-bold">
                        {lot.code} <span className="font-medium text-muted">· {lot.bloc}</span>
                      </span>
                      <span className="text-xs text-muted">{lot.ownerName ?? t.noOwnerYet}</span>
                    </span>
                    <span className="num text-sm font-bold">{formatAmount(lot.remainingMillimes, currency)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">{t.lotsCovered}</span>
          {shown.length === 0 && (
            <span className="text-sm text-muted">{allLots.length ? t.searchToStart : t.allPaid}</span>
          )}
          <div className="scroll flex max-h-[270px] flex-col gap-2 pr-1">
            {shown.map((lot, i) => {
              const on = lot.assessmentId in amounts;
              const value = on ? amountOf(lot) : null;
              const partial = on && value !== null && value < lot.remainingMillimes;
              const firstSibling = i === pickedLots.length;
              return (
                <Fragment key={lot.assessmentId}>
                  {firstSibling && (
                    <span className="label-caps pt-1 text-[11px]">
                      {interpolate(t.otherLotsOf, {
                        name: [...new Set(siblings.map((l) => l.ownerName).filter(Boolean))].join(", "),
                      })}
                    </span>
                  )}
                  <div
                    className={`grid items-center gap-3.5 rounded-xl border px-3.5 py-2.5 ${
                      on
                        ? "grid-cols-[28px_1fr_110px_180px] border-primary bg-primary-tint"
                        : "grid-cols-[28px_1fr_110px] border-line"
                    }`}
                  >
                    <button
                      type="button"
                      className="check"
                      aria-pressed={on}
                      aria-label={lot.code}
                      onClick={() => toggle(lot)}
                    >
                      {on && <Icon name="check" size={14} strokeWidth={3} />}
                    </button>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-bold">
                        {lot.code} <span className="font-medium text-muted">· {lot.bloc}</span>
                        {lot.ownerName && <span className="font-medium text-muted"> · {lot.ownerName}</span>}
                      </span>
                      {lot.partlyPaid && <span className="text-xs font-bold text-ochre">{t.partialAlready}</span>}
                    </span>
                    <span className="flex flex-col items-end gap-0.5">
                      <span className="label-caps text-[11px]">{t.due}</span>
                      <span className="num text-sm font-bold">{formatMoney(lot.remainingMillimes, currency)}</span>
                    </span>
                    {on && (
                      <span className="flex flex-col gap-1">
                        <span className="input-group input-group-sm">
                          <input
                            type="text"
                            inputMode="decimal"
                            aria-label={interpolate(t.amountFor, { code: lot.code })}
                            value={amounts[lot.assessmentId] ?? toInputAmount(lot.remainingMillimes, currency)}
                            onChange={(event) => setAmounts((c) => ({ ...c, [lot.assessmentId]: event.target.value }))}
                          />
                          <span className="input-addon px-2 text-xs">{symbol}</span>
                        </span>
                        {partial && (
                          <span className="flex justify-between gap-1.5 text-[11px] font-semibold text-ochre">
                            {interpolate(t.partialHint, {
                              amount: formatAmount(lot.remainingMillimes - value!, currency),
                            })}
                            <button
                              type="button"
                              className="btn btn-link text-[11px]"
                              onClick={() => setAmounts((c) => ({ ...c, [lot.assessmentId]: null }))}
                            >
                              {t.payAll}
                            </button>
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>

        <div className="well flex items-center justify-between px-4 py-3.5">
          <span className="text-sm text-ink-2">
            {selected.length} {t.lotsSelected}
          </span>
          <span className="num text-[22px] font-bold">
            {formatMoney(total, currency)} <span className="text-[13px] text-muted">{symbol}</span>
          </span>
        </div>

        <Field label={t.note}>
          <textarea className="input" name="note" rows={2} maxLength={500} placeholder={t.notePlaceholder} />
        </Field>

        <ModalActions onCancel={onClose} submitLabel={t.recordPayment} pending={pending} />
      </form>
    </Modal>
  );
}
