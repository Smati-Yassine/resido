"use client";

import { useState } from "react";
import { interpolate } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { downloadFile, fetchFile, FileSheet, isTouchDevice } from "./FileHandOff";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Getting one of the Excel exports: a computer downloads the file; a phone or
 * tablet gets the share sheet (FileSheet), to open it in a spreadsheet app or
 * send it. `sheet` is that sheet, to render while it is up.
 */
export function useWorkbookExport() {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<{ title: string; file: File | null } | null>(null);

  const download = (title: string, file: File) => {
    downloadFile(file);
    toast({ tone: "success", text: interpolate(t.pdfDownloaded, { doc: title }) });
  };

  async function run(href: string, title: string) {
    if (busy) return;
    setBusy(true);
    const touch = isTouchDevice();
    if (touch) setShown({ title, file: null });
    try {
      const file = await fetchFile(href, XLSX, "resido.xlsx");
      if (touch) setShown((current) => current && { title, file });
      else download(title, file);
    } catch {
      setShown(null);
      toast({ tone: "danger", text: t.excelFailed });
    } finally {
      setBusy(false);
    }
  }

  const sheet = shown && (
    <FileSheet
      title={shown.title}
      preparingText={t.excelPreparing}
      readyText={t.excelSheetText}
      file={shown.file}
      icon="sheet"
      kind="XLSX"
      shareLabel={t.excelShare}
      onDownload={(file) => {
        download(shown.title, file);
        setShown(null);
      }}
      onClose={() => setShown(null)}
    />
  );

  /** `preparing`: busy with no sheet saying so — the button tells it instead. */
  return { run, busy, preparing: busy && !shown, sheet };
}
