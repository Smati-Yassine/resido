import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep a visited page for 30 s in the browser: going back to it (or to a
    // tab seen moments ago) is instant. Every save still refreshes what it
    // changed, since the actions revalidate their pages.
    staleTimes: { dynamic: 30 },
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
