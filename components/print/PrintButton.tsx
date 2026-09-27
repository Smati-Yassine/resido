"use client";

import { useState } from "react";
import { interpolate } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { Icon } from "@/components/ui/Icon";
import { downloadFile, fetchFile, FileSheet, isTouchDevice } from "./FileHandOff";

const PDF = "application/pdf";

/**
 * Generates a printable document on the server and hands it over.
 *
 * On a computer: the PDF opens, as a blob, in the browser's viewer — print or
 * save it from there. The tab opens at the click (so pop-up blockers let it
 * through) and shows the PDF once it is ready; with no tab allowed, the PDF
 * is downloaded instead.
 *
 * On a phone or tablet, where a blob tab shows nothing: a sheet waits for the
 * PDF, then "Print or share" gives it to the system's share menu — Print is
 * there on iPhone and iPad, a PDF viewer or any app on Android.
 */
export function PrintButton({ href, label, document: name }: { href: string; label: string; document: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // The phone's sheet: open while the PDF is prepared (file null), then ready.
  const [sheet, setSheet] = useState<{ file: File | null } | null>(null);

  const download = (file: File) => {
    downloadFile(file);
    toast({ tone: "success", text: interpolate(t.pdfDownloaded, { doc: name }) });
  };

  async function openTab() {
    const tab = window.open("", "_blank");
    if (tab) {
      tab.document.title = t.pdfPreparing;
      tab.document.body.style.cssText =
        "font:15px system-ui,sans-serif;color:#5e6470;display:grid;place-items:center;height:100vh;margin:0;background:#f5f1ea";
      tab.document.body.textContent = t.pdfPreparing;
    }
    try {
      const file = await fetchFile(href, PDF, "resido.pdf");
      if (tab && !tab.closed) {
        tab.location.replace(URL.createObjectURL(file));
        toast({ tone: "success", text: interpolate(t.pdfReady, { doc: name }) });
      } else {
        download(file);
      }
    } catch {
      tab?.close();
      toast({ tone: "danger", text: t.pdfFailed });
    }
  }

  async function openSheet() {
    setSheet({ file: null });
    try {
      const file = await fetchFile(href, PDF, "resido.pdf");
      setSheet((open) => open && { file }); // unless closed meanwhile
    } catch {
      setSheet(null);
      toast({ tone: "danger", text: t.pdfFailed });
    }
  }

  async function open() {
    if (busy) return;
    setBusy(true);
    await (isTouchDevice() ? openSheet() : openTab());
    setBusy(false);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-icon-sm"
        onClick={open}
        disabled={busy}
        aria-busy={busy}
        aria-label={busy ? t.pdfPreparing : label}
        title={label}
      >
        <Icon name="printer" size={17} />
        {/* On a phone the printer icon says it alone. */}
        <span className="btn-label-sm-hide">{busy && !sheet ? t.pdfPreparing : label}</span>
      </button>
      {sheet && (
        <FileSheet
          title={name}
          preparingText={t.pdfPreparing}
          readyText={t.pdfSheetText}
          file={sheet.file}
          icon="printer"
          kind="PDF"
          shareLabel={t.pdfShare}
          onDownload={(file) => {
            download(file);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
