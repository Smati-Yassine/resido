"use client";

import { useOptimistic, useTransition } from "react";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { setLotOwnerAction } from "@/lib/actions/workspace";

/** Inline owner picker on a lot row: changing it assigns the lot straight away. */
export function LotOwnerSelect({
  residenceId,
  lot,
  ownerId,
  owners,
}: {
  residenceId: string;
  lot: { id: string; code: string };
  ownerId: string | null;
  owners: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  // Shows the new owner at once; falls back to the server's value if the save fails.
  const [shown, setShown] = useOptimistic(ownerId);

  return (
    <select
      className="input h-9 py-0 text-sm"
      aria-label={`${t.owner} ${lot.code}`}
      value={shown ?? ""}
      disabled={pending}
      onChange={(event) => {
        const owner = owners.find((o) => o.id === event.target.value) ?? null;
        startTransition(async () => {
          setShown(owner?.id ?? null);
          const result = await setLotOwnerAction(residenceId, lot, owner);
          toast({ tone: result.ok ? "success" : "danger", text: result.message });
        });
      }}
    >
      <option value="">{t.noOwner}</option>
      {owners.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
