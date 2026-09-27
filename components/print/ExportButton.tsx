"use client";

import { useI18n } from "@/components/ui/I18nProvider";
import { Icon } from "@/components/ui/Icon";
import { usePopover } from "@/components/ui/usePopover";
import { RESIDENCE_EXPORT, type ExportDoc, type ExportTarget } from "@/lib/export/docs";
import { useWorkbookExport } from "./useWorkbookExport";

const ORDER: ExportDoc[] = ["report", "property", "unpaid", "payments", "expenses", "finances"];

/**
 * "Excel": the cycle's exports as workbooks (lib/export/cycle-workbook.ts),
 * this page's first, the others under it, and last the whole residence —
 * every cycle, the file an import reads back. A computer downloads the file;
 * a phone or tablet gets the same sheet as Print (useWorkbookExport).
 */
export function ExportButton({ current, hrefs }: { current: ExportDoc; hrefs: Record<ExportTarget, string> }) {
  const { t } = useI18n();
  const { open, toggle, close, ref } = usePopover();
  const { run, busy, preparing, sheet } = useWorkbookExport();
  const title = (doc: ExportTarget) =>
    ({
      property: t.docProperty,
      payments: t.docPayments,
      expenses: t.docExpenses,
      unpaid: t.docUnpaid,
      finances: t.docFinances,
      report: t.docReport,
      all: t.docResidence,
    })[doc];

  const exportDoc = (doc: ExportTarget) => {
    close();
    run(hrefs[doc], title(doc));
  };

  const item = (doc: ExportTarget, hint?: string) => (
    <button key={doc} type="button" role="menuitem" className="menu-item py-2.5 text-sm font-semibold" onClick={() => exportDoc(doc)}>
      <span className="flex items-center gap-3">
        <span className="text-olive">
          <Icon name="sheet" size={16} />
        </span>
        <span className="flex flex-col">
          {title(doc)}
          {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
        </span>
      </span>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn btn-ghost btn-icon-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy}
        aria-label={t.excelExports}
        title={t.excelExports}
        disabled={busy}
        onClick={toggle}
      >
        <Icon name="sheet" size={17} />
        <span className="btn-label-sm-hide">{preparing ? t.excelPreparing : t.excel}</span>
        <span className="btn-label-sm-hide text-muted">
          <Icon name="chevronDown" size={15} strokeWidth={2} />
        </span>
      </button>
      {open && <div className="menu-backdrop" aria-hidden="true" onClick={close} />}
      {open && (
        <div
          role="menu"
          aria-label={t.excelExports}
          className="popover menu-sheet flex flex-col gap-0.5 md:absolute md:right-0 md:top-[50px] md:z-20 md:w-[290px]"
        >
          <span className="label-caps px-3 pb-1 pt-2 text-[11px]">{t.excelThisPage}</span>
          {item(current)}
          <div className="divider mx-1 my-1.5" />
          <span className="label-caps px-3 pb-1 pt-1 text-[11px]">{t.excelOthers}</span>
          {ORDER.filter((doc) => doc !== current).map((doc) => item(doc))}
          <div className="divider mx-1 my-1.5" />
          <span className="label-caps px-3 pb-1 pt-1 text-[11px]">{t.excelWhole}</span>
          {item(RESIDENCE_EXPORT, t.docResidenceHint)}
        </div>
      )}
      {sheet}
    </div>
  );
}
