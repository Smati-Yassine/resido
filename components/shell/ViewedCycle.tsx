"use client";

import { createContext, useContext, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CycleStatus } from "@/lib/domain/cycles/schema";

export interface ViewedCycle {
  id: string;
  slug: string;
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
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const param = params.get("cycle");
  // A link from before names the cycle by its id: show its name instead (or
  // nothing, for the current cycle), without reloading the page.
  useEffect(() => {
    const byId = cycles.find((c) => c.id === param);
    if (!byId) return;
    const next = new URLSearchParams(params);
    if (byId.id === defaultCycleId) next.delete("cycle");
    else next.set("cycle", byId.slug);
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [param, cycles, defaultCycleId, params, pathname, router]);
  return <Context.Provider value={{ cycles, defaultCycleId }}>{children}</Context.Provider>;
}

/** The cycle being viewed: `?cycle=` when it names one (by slug, or id in older links), else the default — as the server pages pick it. */
export function useViewedCycle(): ViewedCycle | null {
  const { cycles, defaultCycleId } = useContext(Context);
  const param = useSearchParams().get("cycle");
  return cycles.find((c) => c.slug === param || c.id === param) ?? cycles.find((c) => c.id === defaultCycleId) ?? null;
}

/** Sends the viewed cycle with a form: edits apply to the cycle on screen. */
export function ViewedCycleField() {
  const cycle = useViewedCycle();
  return <input type="hidden" name="cycleId" value={cycle?.id ?? ""} />;
}
