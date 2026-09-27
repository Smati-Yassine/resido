import type { MetadataRoute } from "next";

/**
 * Résido as an installed app (home screen, dock, app list): its own window
 * without browser bars, opening on the residences. Colours are the brand's
 * limestone and night blue; the icons are drawn by scripts/generate-icons.ts.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/residences",
    name: "Résido — gestion de syndic",
    short_name: "Résido",
    description: "Charges, encaissements, dépenses et trésorerie de vos résidences, cycle par cycle.",
    lang: "fr",
    start_url: "/residences",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f1ea",
    theme_color: "#0f2240",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
