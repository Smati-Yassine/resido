import { getDictionary, getPreferences } from "@/lib/i18n/server";
import { AuthPanel } from "@/components/public/AuthPanel";
import { SiteFooter } from "@/components/public/SiteFooter";
import { PublicPreferences } from "@/components/public/PublicPreferences";
import { Icon } from "@/components/ui/Icon";

/**
 * Home for signed-out visitors, on one screen. Left: what Résido is, in a
 * few words, over the brand's arches. Right: theme and language, then sign in
 * or create an account. The footer runs under both. Phones show the sign-in
 * side only.
 */
export default async function PublicHomePage() {
  const { t } = await getDictionary();
  const { theme } = await getPreferences();

  return (
    <div className="landing">
      <div className="landing-main">
        <section className="landing-hero">
          <svg viewBox="0 0 560 460" fill="none" aria-hidden="true" className="landing-arches">
            <path
              d="M40 460V230C40 128 122 46 224 46C326 46 408 128 408 230V460"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M96 460V238C96 168 153 110 224 110C295 110 352 168 352 238V460"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M152 460V246C152 206 184 174 224 174C264 174 296 206 296 246V460"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M430 460V330C430 288 462 256 496 256C530 256 560 288 560 330V460"
              stroke="var(--ochre-light)"
              strokeWidth="2"
            />
          </svg>

          <div className="relative flex items-center gap-3">
            <span className="brand-mark bg-on-night text-night">R</span>
            <span className="font-display text-2xl font-semibold">Résido</span>
          </div>

          <div className="relative flex max-w-[600px] flex-col gap-6">
            <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-ochre-light">
              {t.landingEyebrow}
            </span>
            <h1 className="display text-[clamp(40px,4.2vw,60px)] leading-[1.04]">{t.tagline}</h1>
            <p className="max-w-[480px] text-[17px] leading-relaxed text-night-soft">{t.taglineText}</p>
            <ul className="flex flex-col gap-3">
              {[t.perk1, t.perk2, t.perk3].map((perk) => (
                <li key={perk} className="flex items-center gap-3 text-[15px] font-semibold">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-ochre-light">
                    <Icon name="check" size={14} strokeWidth={2.6} />
                  </span>
                  {perk}
                </li>
              ))}
            </ul>
          </div>

          {/* Keeps the headline block centred between the brand and the footer. */}
          <span aria-hidden="true" />
        </section>

        <aside className="landing-auth">
          <div className="landing-auth-inner">
            {/* Theme and language on top; the brand joins them on phones, where the left panel is hidden. */}
            <div className="landing-auth-top">
              <span className="flex items-center gap-3 lg:invisible">
                <span className="brand-mark">R</span>
                <span className="font-display text-[22px] font-semibold">Résido</span>
              </span>
              <PublicPreferences theme={theme} />
            </div>
            <div className="flex flex-1 items-center">
              <AuthPanel />
            </div>
            <p className="hidden items-center justify-center gap-2 text-center text-[13px] text-muted sm:flex">
              <Icon name="lock" size={15} />
              {t.authNote}
            </p>
          </div>
        </aside>
      </div>
      <SiteFooter t={t} night />
    </div>
  );
}
