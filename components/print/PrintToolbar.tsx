"use client";

import { useEffect } from "react";
import { useI18n } from "@/components/ui/I18nProvider";
import { Icon } from "@/components/ui/Icon";

/** On screen only: opens the print dialog once the fonts are in, and offers it again. */
export function PrintToolbar() {
  const { t } = useI18n();
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) window.print();
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="print-toolbar">
      <span className="text-[13px] text-muted">{t.printHint}</span>
      <div className="flex gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.close()}>
          {t.closeWindow}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
          <Icon name="printer" size={16} />
          {t.print}
        </button>
      </div>
    </div>
  );
}
