import Link from "next/link";
import type { SignedInUser } from "@/lib/session";
import type { Theme } from "@/lib/i18n/server";
import { UserMenu } from "./UserMenu";
import type { ExportableResidence } from "./AccountSettingsModal";

/** Top bar of the signed-in pages outside a residence (residence list, signed-in 404). */
export function AppHeader({
  user,
  theme,
  residences = [],
}: {
  user: SignedInUser;
  theme: Theme;
  residences?: ExportableResidence[];
}) {
  return (
    <header className="topbar px-6 md:px-12">
      <Link href="/residences" className="flex items-center gap-3 text-ink no-underline hover:text-ink">
        <span className="brand-mark">R</span>
        <span className="font-display text-[22px] font-semibold">Résido</span>
      </Link>
      <UserMenu
        user={{ name: user.name, email: user.email }}
        theme={theme}

        residences={residences}
      />
    </header>
  );
}
