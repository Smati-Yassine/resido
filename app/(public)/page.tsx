import { getDictionary } from "@/lib/i18n/server";
import { AuthPanel } from "@/components/public/AuthPanel";
import { SiteFooter } from "@/components/public/SiteFooter";

/** Home for signed-out visitors: brand panel on the left, sign in / sign up on the right. */
export default async function PublicHomePage() {
  const { t } = await getDictionary();
  return (
    <div className="flex min-h-full">
      <aside className="auth-hero">
        <div className="flex items-center gap-3">
          <span className="brand-mark bg-ground text-night">R</span>
          <span className="font-display text-2xl font-semibold">Résido</span>
        </div>
        <svg width="520" height="420" viewBox="0 0 520 420" fill="none" aria-hidden="true" className="auth-hero-arches">
          <path d="M40 420V200C40 110 110 40 200 40C290 40 360 110 360 200V420" stroke="currentColor" strokeWidth="2" />
          <path
            d="M90 420V210C90 150 140 100 200 100C260 100 310 150 310 210V420"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M140 420V220C140 187 167 160 200 160C233 160 260 187 260 220V420"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M380 420V300C380 255 415 220 450 220C485 220 520 255 520 300V420"
            stroke="var(--ochre-light)"
            strokeWidth="2"
          />
        </svg>
        <div className="relative flex flex-col gap-5">
          <h1 className="display text-[52px]">{t.tagline}</h1>
          <p className="max-w-[440px] text-[17px] leading-relaxed text-night-soft">{t.taglineText}</p>
        </div>
        <div className="relative flex gap-8 text-[13px] text-night-muted">
          <span>{t.perk1}</span>
          <span>{t.perk2}</span>
          <span>{t.perk3}</span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex flex-1 items-center justify-center px-6 py-12">
          <AuthPanel />
        </main>
        <SiteFooter t={t} />
      </div>
    </div>
  );
}
