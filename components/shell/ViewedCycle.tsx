"use client";

import { createContext, useContext } from "react";
import { useSearchParams } from "next/navigation";
import type { CycleStatus } from "@/lib/domain/cycles/schema";

export interface ViewedCycle {
  id: string;
  name: string;
  status: CycleStatus;
}

const Context = createContext<{ cycles: ViewedCycle[]; defaultCycleId: string | null }>({
  cycles: [],
  defaultCycleId: null,
});

/** The residence's cycles, so any form can tell which one the page shows. */
export function ViewedCycleProvider({
  cycles,
  defaultCycleId,
  children,
}: {
  cycles: ViewedCycle[];
  defaultCycleId: string | null;
  children: React.ReactNode;
}) {
  return <Context.Provider value={{ cycles, defaultCycleId }}>{children}</Context.Provider>;
}

/** The cycle being viewed: `?cycle=` when it names one, else the default — as the server pages pick it. */
export function useViewedCycle(): ViewedCycle | null {
  const { cycles, defaultCycleId } = useContext(Context);
  const param = useSearchParams().get("cycle");
  return cycles.find((c) => c.id === param) ?? cycles.find((c) => c.id === defaultCycleId) ?? null;
}

/** Sends the viewed cycle with a form: edits apply to the cycle on screen. */
export function ViewedCycleField() {
  const cycle = useViewedCycle();
  return <input type="hidden" name="cycleId" value={cycle?.id ?? ""} />;
}
