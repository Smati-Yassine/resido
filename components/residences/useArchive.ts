"use client";

import { useTransition } from "react";
import { setResidenceArchivedAction } from "@/lib/actions/residences";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";

/** Archive / restore with a toast; archiving offers an Undo. */
export function useArchive() {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const setArchived = (residenceId: string, archived: boolean, after?: () => void) =>
    startTransition(async () => {
      const result = await setResidenceArchivedAction(residenceId, archived);
      if (!result.ok) {
        toast({ tone: "danger", text: result.message });
        return;
      }
      toast({
        tone: archived ? "info" : "success",
        text: result.message,
        action: archived
          ? {
              label: t.undo,
              run: () =>
                startTransition(async () => {
                  const undone = await setResidenceArchivedAction(residenceId, false);
                  toast({ tone: undone.ok ? "success" : "danger", text: undone.message });
                }),
            }
          : undefined,
      });
      after?.();
    });

  return { setArchived, pending };
}
