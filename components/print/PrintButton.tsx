"use client";

import { useState } from "react";
import { interpolate } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

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
 * there on iPhone and iPad, a PDF viewer or any app on Android. The menu can
 * only open on a tap, hence the second one; "Download" saves it instead.
 */
export function PrintButton({ href, label, document: name }: { href: string; label: string; document: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // The phone's sheet: open while the PDF is prepared (file null), then ready.
  const [sheet, setSheet] = useState<{ file: File | null } | null>(null);

  async function fetchPdf() {
    const response = await fetch(href);
    if (!response.ok || response.headers.get("Content-Type") !== "application/pdf")
      throw new Error(String(response.status));
    const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "resido.pdf";
    return new File([await response.blob()], filename, { type: "application/pdf" });
  }

  function download(file: File) {
    const url = URL.createObjectURL(file);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast({ tone: "success", text: interpolate(t.pdfDownloaded, { doc: name }) });
  }

  async function openTab() {
    const tab = window.open("", "_blank");
    if (tab) {
      tab.document.title = t.pdfPreparing;
      tab.document.body.style.cssText =
        "font:15px system-ui,sans-serif;color:#5e6470;display:grid;place-items:center;height:100vh;margin:0;background:#f5f1ea";
      tab.document.body.textContent = t.pdfPreparing;
    }
    try {
      const file = await fetchPdf();
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
      const file = await fetchPdf();
      setSheet((open) => open && { file }); // unless closed meanwhile
    } catch {
      setSheet(null);
      toast({ tone: "danger", text: t.pdfFailed });
    }
  }

  async function open() {
    if (busy) return;
    setBusy(true);
    const touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    await (touch ? openSheet() : openTab());
    setBusy(false);
  }

  const file = sheet?.file ?? null;
  const canShare = !!file && !!navigator.canShare?.({ files: [file] });
  const share = (file: File) =>
    navigator.share({ files: [file], title: name }).then(
      () => setSheet(null),
      (error: Error) => {
        // Closing the menu is not a failure; anything else, the file is saved instead.
        if (error.name !== "AbortError") download(file);
      },
    );

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
        <Modal
          title={name}
          subtitle={file ? t.pdfSheetText : t.pdfPreparing}
          icon="printer"
          size="confirm"
          onClose={() => setSheet(null)}
        >
          {file ? (
            <div className="flex flex-col gap-5">
              <div className="file-tile">
                <span className="file-tile-icon">PDF</span>
                <span className="min-w-0 truncate text-sm font-bold">{file.name}</span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => download(file)}>
                  {t.pdfDownload}
                </button>
                {canShare && (
                  <button type="button" className="btn btn-primary" onClick={() => share(file)}>
                    <Icon name="share" size={17} />
                    {t.pdfShare}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8" role="status" aria-label={t.pdfPreparing}>
              <span className="spinner" />
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
