import Link from "next/link";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { CONTACT_EMAIL } from "@/lib/legal";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LanguageToggle } from "./LanguageToggle";

const CONTACTS: { icon: IconName; href: string; label: (t: Dictionary) => string }[] = [
  { icon: "mail", href: `mailto:${CONTACT_EMAIL}`, label: (t) => `${t.contact} — ${CONTACT_EMAIL}` },
  { icon: "globe", href: "https://yassinesmati.vercel.app/", label: (t) => t.portfolio },
  { icon: "github", href: "https://github.com/Smati-Yassine", label: () => "GitHub" },
  { icon: "linkedin", href: "https://www.linkedin.com/in/smati-yassine/", label: () => "LinkedIn" },
];

/** Footer of every signed-out page: legal links, contact icons, language. */
export function SiteFooter({ t }: { t: Dictionary }) {
  return (
    <footer className="site-footer">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span>© {new Date().getFullYear()} Résido</span>
        <Link href="/privacy">{t.privacy}</Link>
        <Link href="/terms">{t.terms}</Link>
      </div>
      <div className="flex items-center gap-3">
        <nav aria-label={t.contact} className="flex items-center gap-1">
          {CONTACTS.map((c) => {
            const external = c.href.startsWith("http");
            return (
              <a
                key={c.icon}
                href={c.href}
                className="icon-btn icon-btn-bare"
                aria-label={c.label(t)}
                title={c.label(t)}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                <Icon name={c.icon} size={18} />
              </a>
            );
          })}
        </nav>
        <LanguageToggle />
      </div>
    </footer>
  );
}
