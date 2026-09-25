import { getDictionary } from "@/lib/i18n/server";
import { SkeletonBlock } from "@/components/ui/Skeleton";

/** Shown at once when the residences list (or a residence, from it) opens. */
export default async function ResidencesLoading() {
  const { t } = await getDictionary();
  return (
    <div className="flex min-h-full flex-col" role="status" aria-label={t.loadingPage}>
      <div className="topbar px-6 md:px-12">
        <SkeletonBlock className="h-8 w-32" />
        <SkeletonBlock className="h-9 w-40 rounded-full" />
      </div>
      <div className="flex flex-col gap-8 px-6 pb-16 pt-12 md:px-12">
        <div className="flex flex-col gap-3">
          <SkeletonBlock className="h-3.5 w-32" />
          <SkeletonBlock className="h-11 w-80" />
        </div>
        <SkeletonBlock className="h-[104px] rounded-[18px]" />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <SkeletonBlock className="h-[312px] rounded-[20px]" />
          <SkeletonBlock className="h-[312px] rounded-[20px]" />
          <SkeletonBlock className="h-[312px] rounded-[20px]" />
        </div>
      </div>
    </div>
  );
}
