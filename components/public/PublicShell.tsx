import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { getPreferences } from "@/lib/i18n/server";
import { SiteFooter } from "./SiteFooter";
import { PublicPreferences } from "./PublicPreferences";

/** Frame of the signed-out content pages (privacy, terms, 404): brand bar (with theme and language), content, footer. */
export async function PublicShell({ t, children }: { t: Dictionary; children: React.ReactNode }) {
  const { theme } = await getPreferences();
  return (
    <div className="flex min-h-full flex-col">
      <header className="topbar px-6 md:px-12">
        <Link href="/" className="flex items-center gap-3 text-ink no-underline hover:text-ink">
          <span className="brand-mark">R</span>
          <span className="font-display text-[22px] font-semibold">Résido</span>
        </Link>
        <div className="flex items-center gap-3">
          <PublicPreferences theme={theme} />
          <Link href="/" className="btn btn-primary btn-sm">
            {t.signIn}
          </Link>
        </div>
      </header>
      <main className="flex flex-1 flex-col px-6 py-12 md:px-12">{children}</main>
      <SiteFooter t={t} />
    </div>
  );
}
