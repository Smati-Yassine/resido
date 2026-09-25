import { getDictionary } from "@/lib/i18n/server";
import { SkeletonBlock } from "@/components/ui/Skeleton";

/** A blank sheet while the document loads — not the residences list's skeleton. */
export default async function PrintLoading() {
  const { t } = await getDictionary();
  return (
    <div className="print-doc pt-[85px]" role="status" aria-label={t.loadingPage}>
      <div className="print-sheet">
        <SkeletonBlock className="h-10 w-full" />
        <SkeletonBlock className="h-[480px] w-full" />
      </div>
    </div>
  );
}
