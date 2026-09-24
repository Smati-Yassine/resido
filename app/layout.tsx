import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { getDictionary, getPreferences } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/ui/I18nProvider";
import { ToastProvider } from "@/components/ui/Toaster";
import "./globals.css";

const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], axes: ["opsz"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Résido",
  description: "Gestion de syndic — charges, encaissements, dépenses et trésorerie, cycle par cycle.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { theme } = await getPreferences();
  const { t, locale } = await getDictionary();
  return (
    <html lang={locale} data-theme={theme} className={`${fraunces.variable} ${manrope.variable}`}>
      <body>
        <I18nProvider t={t} locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
