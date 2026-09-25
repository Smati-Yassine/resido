"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/components/ui/I18nProvider";
import { AfterActionProvider } from "@/components/ui/AfterAction";
import { CurrencyProvider } from "@/components/ui/CurrencyProvider";
import { ResidenceBaseProvider } from "@/components/shell/ResidenceLink";
import { ResidenceSettingsView } from "@/components/settings/ResidenceSettingsView";
import { loadResidenceSettingsAction } from "@/lib/actions/residences";
import { interpolate } from "@/lib/i18n/dictionaries";
import type { ResidenceSettingsData, SettingsTab } from "@/lib/settings/residence-settings";

/**
 * A residence's settings over the residences list — the settings page, in a
 * modal. It loads the settings itself and reloads them after every change
 * made inside; once the residence is deleted, archived or left, it closes.
 */
export function ResidenceSettingsModal({
  residenceId,
  residenceName,
  onClose,
}: {
  residenceId: string;
  residenceName: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<ResidenceSettingsData | null>(null);
  const [tab, setTab] = useState<SettingsTab>("general");
  // The list re-renders (and hands a new onClose) whenever it refreshes; that must not reload the settings.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  const reload = useCallback(async () => {
    const next = await loadResidenceSettingsAction(residenceId).catch(() => null);
    if (next) setData(next);
    else closeRef.current();
  }, [residenceId]);

  useEffect(() => {
    let live = true;
    loadResidenceSettingsAction(residenceId)
      .catch(() => null)
      .then((next) => {
        if (!live) return;
        if (next) setData(next);
        else closeRef.current();
      });
    return () => {
      live = false;
    };
  }, [residenceId]);

  return (
    <Modal
      title={interpolate(t.settingsOf, { name: data?.residence.name ?? residenceName })}
      subtitle={data ? [data.residence.city, `${data.lotCount} ${t.lotsWord}`].filter(Boolean).join(" · ") : undefined}
      size="panel"
      icon="settings"
      onClose={onClose}
    >
      {data ? (
        <AfterActionProvider onChange={reload}>
          <ResidenceBaseProvider base={data.residence.base}>
            <CurrencyProvider code={data.residence.currency}>
              <ResidenceSettingsView data={data} tab={tab} onTab={setTab} mode="modal" onGone={onClose} />
            </CurrencyProvider>
          </ResidenceBaseProvider>
        </AfterActionProvider>
      ) : (
        <p className="py-16 text-center text-sm text-muted">{t.loadingSettings}</p>
      )}
    </Modal>
  );
}
