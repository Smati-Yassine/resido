"use client";

import { useI18n } from "@/components/ui/I18nProvider";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

/**
 * Getting a generated file (a PDF, a workbook) from the server into the
 * user's hands — shared by the Print and Excel buttons.
 */

/** Phones and tablets: files go through the share menu there (see FileSheet). */
export const isTouchDevice = () => window.matchMedia("(hover: none) and (pointer: coarse)").matches;

/** Fetches a generated file; throws unless the server sent one of `type`. */
export async function fetchFile(href: string, type: string, fallbackName: string) {
  const response = await fetch(href);
  if (!response.ok || response.headers.get("Content-Type") !== type) throw new Error(String(response.status));
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  return new File([await response.blob()], name, { type });
}

/** Saves a file through the browser's downloads. */
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The phone's sheet for a file on its way: a spinner while it is generated,
 * then the file with "share" (the system's share menu — Print, Files, mail,
 * WhatsApp…) and "download". The share menu only opens on a tap, hence the
 * second one. `file` null: still preparing.
 */
export function FileSheet({
  title,
  preparingText,
  readyText,
  file,
  icon,
  kind,
  shareLabel,
  onDownload,
  onClose,
}: {
  title: string;
  preparingText: string;
  readyText: string;
  file: File | null;
  icon: IconName;
  /** The file's type in the tile: "PDF", "XLSX". */
  kind: string;
  shareLabel: string;
  onDownload: (file: File) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const canShare = !!file && !!navigator.canShare?.({ files: [file] });
  const share = (file: File) =>
    navigator.share({ files: [file], title }).then(onClose, (error: Error) => {
      // Closing the menu is not a failure; anything else, the file is saved instead.
      if (error.name !== "AbortError") onDownload(file);
    });

  return (
    <Modal title={title} subtitle={file ? readyText : preparingText} icon={icon} size="confirm" onClose={onClose}>
      {file ? (
        <div className="flex flex-col gap-5">
          <div className="file-tile">
            <span className="file-tile-icon" data-kind={kind}>
              {kind}
            </span>
            <span className="min-w-0 truncate text-sm font-bold">{file.name}</span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => onDownload(file)}>
              {t.pdfDownload}
            </button>
            {canShare && (
              <button type="button" className="btn btn-primary" onClick={() => share(file)}>
                <Icon name="share" size={17} />
                {shareLabel}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-8" role="status" aria-label={preparingText}>
          <span className="spinner" />
        </div>
      )}
    </Modal>
  );
}
