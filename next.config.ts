import type { NextConfig } from "next";

/**
 * One id per deploy (Vercel provides one; the commit is the fallback). With
 * it, a page left open when a new version ships reloads itself fully at its
 * next navigation instead of mixing old and new code; the app also compares
 * it on returning to the foreground (components/ui/AppRuntime.tsx, against
 * /api/version). Unset locally: no such checks.
 */
const deploymentId =
  process.env.NEXT_DEPLOYMENT_ID || process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || undefined;

const nextConfig: NextConfig = {
  deploymentId,
  // The same id, built into the code on both sides: the page knows its version.
  env: { RESIDO_BUILD: deploymentId ?? "" },
  // The PDF documents read their fonts from disk at runtime; ship them with that route.
  outputFileTracingIncludes: {
    "/residences/[residenceId]/print/[doc]": ["./lib/print/fonts/**/*"],
  },
  experimental: {
    // Keep a visited page for 30 s in the browser: going back to it (or to a
    // tab seen moments ago) is instant. Every save still refreshes what it
    // changed, since the actions revalidate their pages.
    staleTimes: { dynamic: 30 },
    // Connection lost (a phone in a stairwell): pages and saves wait and run
    // once it is back, instead of failing; the app says it is offline meanwhile.
    useOffline: true,
  },
  // The service worker is always fetched fresh, so a new version reaches every installed app.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  // Payments, expenses and treasury became tabs of one Finances page; old links land on the matching tab.
  // Query values (e.g. ?cycle=) are passed through.
  async redirects() {
    return [
      {
        source: "/residences/:residence/payments",
        destination: "/residences/:residence/finances/payments",
        permanent: true,
      },
      {
        source: "/residences/:residence/expenses",
        destination: "/residences/:residence/finances/expenses",
        permanent: true,
      },
      {
        source: "/residences/:residence/treasury",
        destination: "/residences/:residence/finances",
        permanent: true,
      },
      // Lots and owners became tabs of one Copropriété page.
      { source: "/residences/:residence/lots", destination: "/residences/:residence/property/lots", permanent: true },
      {
        source: "/residences/:residence/owners",
        destination: "/residences/:residence/property/owners",
        permanent: true,
      },
      // Cycles moved into Settings.
      {
        source: "/residences/:residence/cycles",
        destination: "/residences/:residence/settings/cycles",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
