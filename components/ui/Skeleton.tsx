/**
 * Loading placeholders, shown the instant a page is opened while its data
 * arrives (loading.tsx files). Shaped like the pages they stand for.
 */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

/** A residence page: title, a stat strip, then two rows of cards. */
export function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label={label}>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <SkeletonBlock className="h-3.5 w-44" />
          <SkeletonBlock className="h-10 w-72" />
        </div>
        <SkeletonBlock className="h-11 w-44 rounded-[12px]" />
      </div>
      <SkeletonBlock className="h-[112px] rounded-[18px]" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SkeletonBlock className="h-[300px] rounded-[18px] xl:col-span-2" />
        <SkeletonBlock className="h-[300px] rounded-[18px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SkeletonBlock className="h-[220px] rounded-[18px] xl:col-span-2" />
        <SkeletonBlock className="h-[220px] rounded-[18px]" />
      </div>
    </div>
  );
}
