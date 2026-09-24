"use client";

import { createContext, useContext } from "react";
import { CURRENCIES, DEFAULT_CURRENCY, type CurrencyCode } from "@/lib/currency";

const CurrencyContext = createContext<CurrencyCode>(DEFAULT_CURRENCY);

/** The currency of the residence being viewed, for client components (inputs, modals). */
export function CurrencyProvider({ code, children }: { code: CurrencyCode; children: React.ReactNode }) {
  return <CurrencyContext.Provider value={code}>{children}</CurrencyContext.Provider>;
}

export function useCurrency() {
  const code = useContext(CurrencyContext);
  return { code, ...CURRENCIES[code] };
}
