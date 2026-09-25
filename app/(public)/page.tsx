import { getDictionary, getPreferences } from "@/lib/i18n/server";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { formatAmount } from "@/lib/format";
import { AuthPanel } from "@/components/public/AuthPanel";
import { SiteFooter } from "@/components/public/SiteFooter";
import { PublicPreferences } from "@/components/public/PublicPreferences";
import { Gauge } from "@/components/dashboard/Charts";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Home for signed-out visitors. Left: what Résido is — tagline, a preview of
 * the dashboard, four strengths — with the footer at its foot. Right: sign in
 * or create an account, kept in view. On phones the form comes first.
 */
export default async function PublicHomePage() {
  const { t } = await getDictionary();
  const { theme } = await getPreferences();
  const features: { icon: IconName; title: keyof Dictionary; text: keyof Dictionary }[] = [
    { icon: "treasury", title: "feat1Title", text: "feat1Text" },
    { icon: "income", title: "feat2Title", text: "feat2Text" },
    { icon: "calendar", title: "feat3Title", text: "feat3Text" },
    { icon: "owners", title: "feat4Title", text: "feat4Text" },
  ];

  return (
    <div className="landing">
      <section className="landing-hero">
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

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="brand-mark bg-on-night text-night">R</span>
            <span className="font-display text-2xl font-semibold">Résido</span>
          </div>
          <div className="hidden lg:block">
            <PublicPreferences theme={theme} night />
          </div>
        </div>

        <div className="relative flex max-w-[640px] flex-col gap-5">
          <span className="text-[13px] font-bold uppercase tracking-[0.12em] text-ochre-light">{t.landingEyebrow}</span>
          <h1 className="display text-[40px] leading-[1.05] md:text-[56px]">{t.tagline}</h1>
          <p className="max-w-[520px] text-[17px] leading-relaxed text-night-soft">{t.taglineText}</p>
        </div>

        <Preview t={t} />

        <ul className="relative grid max-w-[760px] grid-cols-1 gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <li key={f.title} className="flex gap-3.5">
              <span className="landing-feature-icon">
                <Icon name={f.icon} size={19} />
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-bold">{t[f.title] as string}</span>
                <span className="text-sm leading-relaxed text-night-soft">{t[f.text] as string}</span>
              </span>
            </li>
          ))}
        </ul>

        <SiteFooter t={t} night />
      </section>

      <aside className="landing-auth">
        <div className="landing-auth-inner">
          {/* On phones the form comes first: the brand goes above it. */}
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <span className="flex items-center gap-3">
              <span className="brand-mark">R</span>
              <span className="font-display text-[22px] font-semibold">Résido</span>
            </span>
            <PublicPreferences theme={theme} />
          </div>
          <AuthPanel />
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <Icon name="lock" size={15} />
            {t.authNote}
          </p>
        </div>
      </aside>
    </div>
  );
}

/** An illustration of the dashboard: collection rate, the three figures, and the lots as tiles. */
function Preview({ t }: { t: Dictionary }) {
  const tiles = "PPPUPPAPPUPPPUAPPPPUPPAP"
    .split("")
    .map((c) => (c === "P" ? "PAID" : c === "A" ? "PARTIAL" : "UNPAID"));
  const figures: [string, number, string][] = [
    [t.kpiExpected, 48_600_000, ""],
    [t.kpiCollected, 34_992_000, "text-night-pos"],
    [t.kpiOutstanding, 13_608_000, "text-ochre-light"],
  ];
  return (
    <figure className="landing-preview relative max-w-[760px]" aria-label={t.previewCaption}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{t.previewResidence}</span>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-night-ink">{t.previewCycle}</span>
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <Gauge value={72} />
        <dl className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          {figures.map(([label, value, tone]) => (
            <div key={label} className="flex flex-col gap-1">
              <dt className="text-xs text-night-soft">{label}</dt>
              <dd className={`num text-[17px] font-bold ${tone}`}>{formatAmount(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="lot-map">
        {tiles.map((status, i) => (
          <span key={i} className="lot-tile lot-tile-sm" data-status={status}>
            {String.fromCharCode(65 + Math.floor(i / 6))}
            {(i % 6) + 1}
          </span>
        ))}
      </div>
    </figure>
  );
}
