/**
 * The public site as search engines see it: its address and the words it
 * wants to be found for. SITE_URL moves it to a custom domain (set it in
 * Vercel); GOOGLE_SITE_VERIFICATION is the code Google Search Console gives
 * for its HTML-tag check.
 */
export const SITE_URL = (process.env.SITE_URL ?? "https://residooo.vercel.app").replace(/\/$/, "");

export const SITE_NAME = "Résido";

/** The landing page, written for "gestion de copropriété" (French, the app's default). */
export const HOME_TITLE = "Logiciel de gestion de copropriété en ligne | Résido";
export const HOME_DESCRIPTION =
  "Résido, le logiciel de gestion de copropriété pour syndics : appels de charges, encaissements, dépenses et trésorerie, cycle par cycle. En ligne, sur ordinateur et mobile.";
