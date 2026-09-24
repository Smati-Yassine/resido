import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n/server";
import { LEGAL } from "@/lib/legal";
import { PublicShell } from "@/components/public/PublicShell";
import { LegalPage } from "@/components/public/LegalPage";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: `${t.terms} · Résido` };
}

export default async function TermsPage() {
  const { t, locale } = await getDictionary();
  return (
    <PublicShell t={t}>
      <LegalPage t={t} title={t.terms} doc={LEGAL.terms[locale]} />
    </PublicShell>
  );
}
