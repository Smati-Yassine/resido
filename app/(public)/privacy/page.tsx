import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n/server";
import { LEGAL } from "@/lib/legal";
import { PublicShell } from "@/components/public/PublicShell";
import { LegalPage } from "@/components/public/LegalPage";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: `${t.privacy} · Résido` };
}

export default async function PrivacyPage() {
  const { t, locale } = await getDictionary();
  return (
    <PublicShell t={t}>
      <LegalPage t={t} title={t.privacy} doc={LEGAL.privacy[locale]} />
    </PublicShell>
  );
}
