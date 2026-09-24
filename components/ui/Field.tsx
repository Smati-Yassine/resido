"use client";

import { useCurrency } from "./CurrencyProvider";

/** A labelled form control; the label wraps the control so no id wiring is needed. */
export function Field({
  label,
  hint,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      {label}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Decimal amount input with the residence's currency as a suffix. */
export function MoneyInput({
  scale = "md",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & { scale?: "sm" | "md" | "lg" }) {
  const { symbol, decimals } = useCurrency();
  return (
    <span className={`input-group ${scale === "sm" ? "input-group-sm" : scale === "lg" ? "input-group-lg" : ""}`}>
      <input type="text" inputMode="decimal" autoComplete="off" placeholder={(0).toFixed(decimals)} {...props} />
      <span className="input-addon">{symbol}</span>
    </span>
  );
}
