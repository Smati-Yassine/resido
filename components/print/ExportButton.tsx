"use client";

import { useState } from "react";
import { interpolate } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { Icon } from "@/components/ui/Icon";
import { usePopover } from "@/components/ui/usePopover";
import type { ExportDoc } from "@/lib/export/docs";
import { downloadFile, fetchFile, FileSheet, isTouchDevice } from "./FileHandOff";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ORDER: ExportDoc[] = ["report", "property", "unpaid", "payments", "expenses", "finances"];

/**
 * "Excel": the cycle's exports as workbooks (lib/export/cycle-workbook.ts),
 * this page's first, the others under it. A computer downloads the file; a
 * phone or tablet gets the same sheet as Print, to open it in a spreadsheet
 * app or send it.
 */
export function ExportButton({ current, hrefs }: { current: ExportDoc; hrefs: Record<ExportDoc, string> }) {
  const { t } = useI18n();
  const toast = useToast();
  const { open, toggle, close, ref } = usePopover();
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<{ doc: ExportDoc; file: File | null } | null>(null);
  const title = (doc: ExportDoc) =>
    ({
      property: t.docProperty,
      payments: t.docPayments,
      expenses: t.docExpenses,
      unpaid: t.docUnpaid,
      finances: t.docFinances,
      report: t.docReport,
    })[doc];

  const download = (doc: ExportDoc, file: File) => {
    downloadFile(file);
    toast({ tone: "success", text: interpolate(t.pdfDownloaded, { doc: title(doc) }) });
  };

  async function exportDoc(doc: ExportDoc) {
    close();
    if (busy) return;
    setBusy(true);
    const touch = isTouchDevice();
    if (touch) setSheet({ doc, file: null });
    try {
      const file = await fetchFile(hrefs[doc], XLSX, "resido.xlsx");
      if (touch) setSheet((shown) => shown && { doc, file });
      else download(doc, file);
    } catch {
      setSheet(null);
      toast({ tone: "danger", text: t.excelFailed });
    } finally {
      setBusy(false);
    }
  }

  const item = (doc: ExportDoc) => (
    <button key={doc} type="button" role="menuitem" className="menu-item py-2.5 text-sm font-semibold" onClick={() => exportDoc(doc)}>
      <span className="flex items-center gap-3">
        <span className="text-olive">
          <Icon name="sheet" size={16} />
        </span>
        {title(doc)}
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
        <span className="btn-label-sm-hide">{busy && !sheet ? t.excelPreparing : t.excel}</span>
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
          {ORDER.filter((doc) => doc !== current).map(item)}
        </div>
      )}
      {sheet && (
        <FileSheet
          title={title(sheet.doc)}
          preparingText={t.excelPreparing}
          readyText={t.excelSheetText}
          file={sheet.file}
          icon="sheet"
          kind="XLSX"
          shareLabel={t.excelShare}
          onDownload={(file) => {
            download(sheet.doc, file);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
