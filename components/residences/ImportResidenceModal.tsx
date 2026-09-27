"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Field } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { useI18n } from "@/components/ui/I18nProvider";
import { useToast } from "@/components/ui/Toaster";
import type { ImportResponse } from "@/lib/import/describe";

const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Importing a "Whole residence" workbook as a new residence (POST
 * /api/imports/residence). A file with problems imports nothing: they are
 * listed here, one line each, to fix in the file and try again. Done, the
 * new residence opens.
 */
export function ImportResidenceModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [over, setOver] = useState(false);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);

  const choose = (chosen: File | null | undefined) => {
    setIssues([]);
    if (!chosen) return;
    if (!/\.xlsx$/i.test(chosen.name)) return toast({ tone: "danger", text: t.importNoFile });
    if (chosen.size > MAX_BYTES) return toast({ tone: "danger", text: t.importTooLarge });
    setFile(chosen);
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return toast({ tone: "danger", text: t.importNoFile });
    const body = new FormData(event.currentTarget);
    body.set("file", file);
    setPending(true);
    setIssues([]);
    try {
      const response = await fetch("/api/imports/residence", { method: "POST", body });
      const result = (await response.json().catch(() => null)) as ImportResponse | null;
      if (!result) throw new Error(String(response.status));
      if (!result.ok) {
        setIssues(result.issues);
        toast({ tone: "danger", text: result.message });
        return;
      }
      toast({ tone: "success", text: result.message });
      onClose();
      router.push(`/residences/${result.slug}`);
      router.refresh();
    } catch {
      toast({ tone: "danger", text: t.errGeneric });
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title={t.importTitle} subtitle={t.importText} icon="upload" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label
          className="file-drop"
          data-over={over}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            choose(event.dataTransfer.files[0]);
          }}
        >
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-label={t.importFile}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          {file ? (
            <span className="file-tile w-full text-left text-ink">
              <span className="file-tile-icon" data-kind="XLSX">
                XLSX
              </span>
              <span className="min-w-0 truncate text-sm font-bold">{file.name}</span>
            </span>
          ) : (
            <>
              <Icon name="upload" size={22} />
              <span className="text-sm font-bold text-ink">{t.importFile}</span>
              <span>{t.importFileHint}</span>
            </>
          )}
        </label>

        <Field label={t.importName} hint={t.importNameHelp}>
          <input className="input" name="name" maxLength={120} />
        </Field>

        {issues.length > 0 && (
          <div className="flex flex-col gap-2" role="alert">
            <span className="text-sm font-bold text-neg">{t.importIssuesTitle}</span>
            <ul className="issue-list">
              {issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
            {issues.length >= 25 && <span className="text-xs text-muted">{t.importMoreIssues}</span>}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.cancel}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!file || pending} aria-busy={pending}>
            <Icon name="upload" size={17} />
            {pending ? t.importing : t.importCta}
          </button>
        </div>
      </form>
    </Modal>
  );
}
