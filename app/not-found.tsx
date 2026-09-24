import Link from "next/link";
import { getSignedInUser } from "@/lib/session";
import { getDictionary, getPreferences } from "@/lib/i18n/server";
import { Icon } from "@/components/ui/Icon";
import { PublicShell } from "@/components/public/PublicShell";
import { AppHeader } from "@/components/shell/AppHeader";

/**
 * One URL, two 404s: signed-in visitors stay inside the app frame and are
 * sent back to their residences; signed-out visitors get the public frame.
 */
export default async function NotFound() {
  const user = await getSignedInUser();
  const { t } = await getDictionary();
  const { theme } = await getPreferences();
  const signedIn = !!user;

  const body = (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="tile-icon mb-2">
        <Icon name="compass" size={24} />
      </span>
      <span className="error-code">404</span>
      <h1 className="display text-[36px]">{t.notFoundTitle}</h1>
      <p className="max-w-md text-[15px] text-muted">{signedIn ? t.notFoundSignedIn : t.notFoundText}</p>
      <Link href={signedIn ? "/residences" : "/"} className="btn btn-primary mt-2">
        {signedIn ? t.backToResidences : t.backHome}
      </Link>
    </div>
  );

  if (!user) return <PublicShell t={t}>{body}</PublicShell>;
  return (
    <div className="flex min-h-full flex-col">
      <AppHeader user={user} theme={theme} />
      <main className="flex flex-1 flex-col px-6 md:px-12">{body}</main>
    </div>
  );
}
