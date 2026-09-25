import Link from "next/link";
import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import type { Cycle } from "@/lib/domain/cycles/schema";
import { Icon } from "@/components/ui/Icon";
import { NewCycleButton, OpenCycleButton } from "./CycleControls";

type StepState = "done" | "current" | "todo";

/**
 * A new residence's first steps, in order: blocs and lots, their owners,
 * the year's cycle, then opening it — which bills every lot. Shown on the
 * dashboard until a first cycle opens.
 */
export function SetupGuide({
  t,
  base,
  residenceId,
  counts,
  draft,
  can,
}: {
  t: Dictionary;
  base: string;
  residenceId: string;
  counts: { blocs: number; lots: number; assigned: number };
  /** The cycle waiting to open, once created. */
  draft: Cycle | null;
  can: { lots: boolean; owners: boolean; cycles: boolean };
}) {
  const done = [counts.lots > 0, counts.lots > 0 && counts.assigned === counts.lots, !!draft, false];
  const current = done.indexOf(false);
  const state = (i: number): StepState => (done[i] ? "done" : i === current ? "current" : "todo");

  const steps: { title: string; detail?: string; action: React.ReactNode }[] = [
    {
      title: t.setupLots,
      detail:
        counts.lots > 0
          ? interpolate(t.setupLotsDone, {
              blocs: counts.blocs,
              lots: counts.lots,
            })
          : undefined,
      action: can.lots && (
        <Link href={`${base}/lots`} className="btn btn-ghost btn-sm">
          {t.setupGo}
        </Link>
      ),
    },
    {
      title: t.setupOwners,
      detail:
        counts.lots > 0
          ? interpolate(t.setupOwnersDone, {
              assigned: counts.assigned,
              total: counts.lots,
            })
          : undefined,
      action: can.owners && (
        <Link href={`${base}/owners`} className="btn btn-ghost btn-sm">
          {t.setupGo}
        </Link>
      ),
    },
    {
      title: t.setupCycle,
      detail: draft?.name,
      action: can.cycles && !draft && <NewCycleButton residenceId={residenceId} label={t.createFirstCycle} />,
    },
    {
      title: t.setupOpen,
      action: can.cycles && draft && <OpenCycleButton residenceId={residenceId} cycleId={draft.id} />,
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="h-card">{t.setupTitle}</h2>
        <p className="text-sm text-muted">{t.setupText}</p>
      </div>
      <ol className="flex flex-col gap-2.5">
        {steps.map((step, i) => (
          <li key={i} className="setup-step" data-state={state(i)}>
            <span className="setup-num" aria-label={interpolate(t.setupStep, { n: i + 1 })}>
              {done[i] ? <Icon name="check" size={16} strokeWidth={2.6} /> : i + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-semibold">{step.title}</span>
              {step.detail && <span className="text-[13px] text-muted">{step.detail}</span>}
            </span>
            {state(i) !== "todo" && step.action}
          </li>
        ))}
      </ol>
    </section>
  );
}
