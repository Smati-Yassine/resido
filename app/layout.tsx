import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { getDictionary, getPreferences } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/ui/I18nProvider";
import { ToastProvider } from "@/components/ui/Toaster";
import { AppRuntime } from "@/components/ui/AppRuntime";
import { HOME_DESCRIPTION, HOME_TITLE, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

/**
 * Defaults for every page: each sets its own title (shown as "<title> · Résido"),
 * the public ones their description and canonical address too.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: HOME_TITLE, template: `%s · ${SITE_NAME}` },
  description: HOME_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "fr_FR",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: HOME_TITLE, description: HOME_DESCRIPTION },
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
  // Added to an iPhone's home screen, it opens as an app of its own.
  appleWebApp: { capable: true, title: "Résido", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

/**
 * The page fills the whole screen, under the notch and the home indicator
 * too (the layout keeps clear of them: --safe-* in globals.css), and the
 * browser's bars take the colour of the chosen theme's top bar.
 */
export async function generateViewport(): Promise<Viewport> {
  const { theme } = await getPreferences();
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    // --surface-2 of each theme (a meta tag cannot read the CSS tokens).
    themeColor: theme === "dark" ? "#1c2129" : "#fbf9f5",
    colorScheme: theme,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { theme } = await getPreferences();
  const { t, locale } = await getDictionary();
  return (
    <html lang={locale} data-theme={theme} className={`${fraunces.variable} ${manrope.variable}`}>
      <body>
        <I18nProvider t={t} locale={locale}>
          <ToastProvider>
            {children}
            <AppRuntime />
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
