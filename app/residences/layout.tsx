import type { Metadata } from "next";

/** Everything under /residences is private (behind sign-in): kept out of search engines. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ResidencesLayout({ children }: LayoutProps<"/residences">) {
  return children;
}
