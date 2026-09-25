"use client";

import { createContext, useContext } from "react";

/**
 * Something to run after any action succeeds inside this part of the page.
 * Pages need nothing (actions revalidate them); a modal that shows data it
 * loaded itself — residence settings opened from the residences list —
 * provides its reload here, so every change inside it shows at once.
 */
const AfterActionContext = createContext<(() => void) | null>(null);

export function AfterActionProvider({ onChange, children }: { onChange: () => void; children: React.ReactNode }) {
  return <AfterActionContext.Provider value={onChange}>{children}</AfterActionContext.Provider>;
}

export function useAfterAction(): () => void {
  const onChange = useContext(AfterActionContext);
  return () => onChange?.();
}
