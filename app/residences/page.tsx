import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { getDictionary, getPreferences } from "@/lib/i18n/server";
import { listResidenceCards } from "@/lib/domain/residences/service";
import { HomeView, type ResidenceCardView } from "@/components/residences/HomeView";
import { AppHeader } from "@/components/shell/AppHeader";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getDictionary();
  return { title: `${t.yourResidences} · Résido` };
}

/** "Mes résidences": every residence the user belongs to — create, edit, archive, delete or open one. */
export default async function ResidencesPage() {
  const user = await requireUser();
  const [cards, { theme }] = await Promise.all([listResidenceCards(user.userId), getPreferences()]);
  const residences: ResidenceCardView[] = cards.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    slug: c.slug,
    archived: c.status === "ARCHIVED",
    lotCount: c.lotCount,
    blocCount: c.blocCount,
    cycleName: c.currentCycle?.name ?? null,
    cycleIsOpen: c.currentCycle?.status === "OPEN",
    collectionRate: c.collectionRate,
    outstandingMillimes: c.outstandingMillimes,
    currency: c.currency,
    role: c.role,
    isAdmin: c.role === "SYNDIC_ADMIN",
  }));

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        user={user}
        theme={theme}

        residences={cards.map((c) => ({ id: c.id, name: c.name }))}
      />
      <main className="flex flex-1 flex-col gap-8 px-6 pb-16 pt-12 md:px-12">
        <HomeView residences={residences} firstName={user.name.split(" ")[0]} />
      </main>
    </div>
  );
}
