import { interpolate, type Dictionary } from "@/lib/i18n/dictionaries";
import { formatDate } from "@/lib/format";
import { LEGAL_UPDATED, type LegalDocument } from "@/lib/legal";

export function LegalPage({ t, title, doc }: { t: Dictionary; title: string; doc: LegalDocument }) {
  return (
    <article className="mx-auto flex w-full max-w-[720px] flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="eyebrow">Résido</span>
        <h1 className="display text-[44px]">{title}</h1>
        <p className="subtle">{interpolate(t.lastUpdated, { date: formatDate(LEGAL_UPDATED) })}</p>
        <p className="text-[17px] leading-relaxed text-ink-2">{doc.intro}</p>
      </header>
      {doc.sections.map((section) => (
        <section key={section.title} className="flex flex-col gap-3">
          <h2 className="h-card text-lg">{section.title}</h2>
          {section.paragraphs.map((p) => (
            <p key={p} className="leading-relaxed text-ink-2">
              {p}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
