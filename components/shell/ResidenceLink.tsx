"use client";

import { createContext, useContext } from "react";

/** Base URL of the residence being viewed (`/residences/<slug>`), for client-side links. */
const ResidenceBaseContext = createContext<string>("/residences");

export function ResidenceBaseProvider({ base, children }: { base: string; children: React.ReactNode }) {
  return <ResidenceBaseContext.Provider value={base}>{children}</ResidenceBaseContext.Provider>;
}

export function useResidenceBase(): string {
  return useContext(ResidenceBaseContext);
}
