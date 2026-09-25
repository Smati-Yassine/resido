import { getDictionary } from "@/lib/i18n/server";
import { PageSkeleton } from "@/components/ui/Skeleton";

/** Shown at once when a residence page opens: the shell stays, the content is a placeholder until it arrives. */
export default async function ResidencePageLoading() {
  const { t } = await getDictionary();
  return <PageSkeleton label={t.loadingPage} />;
}
