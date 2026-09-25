import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Payments, expenses and treasury became tabs of one Finances page; old links land on the matching tab.
  // Query values (e.g. ?cycle=) are passed through.
  async redirects() {
    return [
      { source: "/residences/:residence/payments", destination: "/residences/:residence/finances?tab=payments", permanent: true },
      { source: "/residences/:residence/expenses", destination: "/residences/:residence/finances?tab=expenses", permanent: true },
      { source: "/residences/:residence/treasury", destination: "/residences/:residence/finances", permanent: true },
    ];
  },
};

export default nextConfig;
