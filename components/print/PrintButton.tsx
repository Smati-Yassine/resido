"use client";

import { useState } from "react";
import { interpolate } from "@/lib/i18n/dictionaries";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import { Icon } from "@/components/ui/Icon";

/**
 * Generates a printable document on the server and opens it, as a PDF blob,
 * in the browser's viewer — print or save it from there. The tab opens at
 * the click (so pop-up blockers let it through) and shows the PDF once it is
 * ready; with no tab allowed, the PDF is downloaded instead.
 */
export function PrintButton({ href, label, document: name }: { href: string; label: string; document: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function open() {
    if (busy) return;
    setBusy(true);
    const tab = window.open("", "_blank");
    if (tab) {
      tab.document.title = t.pdfPreparing;
      tab.document.body.style.cssText =
        "font:15px system-ui,sans-serif;color:#5e6470;display:grid;place-items:center;height:100vh;margin:0;background:#f5f1ea";
      tab.document.body.textContent = t.pdfPreparing;
    }
    try {
      const response = await fetch(href);
      if (!response.ok || response.headers.get("Content-Type") !== "application/pdf")
        throw new Error(String(response.status));
      const url = URL.createObjectURL(await response.blob());
      if (tab && !tab.closed) {
        tab.location.replace(url);
        toast({ tone: "success", text: interpolate(t.pdfReady, { doc: name }) });
      } else {
        const link = window.document.createElement("a");
        link.href = url;
        link.download =
          /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "resido.pdf";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        toast({ tone: "success", text: interpolate(t.pdfDownloaded, { doc: name }) });
      }
    } catch {
      tab?.close();
      toast({ tone: "danger", text: t.pdfFailed });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={open} disabled={busy} aria-busy={busy}>
      <Icon name="printer" size={17} />
      {busy ? t.pdfPreparing : label}
    </button>
  );
}
