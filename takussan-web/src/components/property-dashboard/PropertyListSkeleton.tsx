import { Skeleton } from '@/components/ui/skeleton';

export function PropertyListSkeleton({ rows = 5 }: { readonly rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-xl bg-card md:block">
        <div className="border-b border-muted/60 px-4 py-3">
          <Skeleton className="h-3 w-32" />
        </div>
        <ul className="divide-y divide-muted/60">
          {Array.from({ length: rows }).map((_, idx) => (
            <li key={idx} className="flex items-center gap-4 px-4 py-4">
              <Skeleton className="size-4 rounded" />
              <Skeleton className="size-14 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-8 w-20" />
            </li>
          ))}
        </ul>
      </div>
      <ul className="space-y-3 md:hidden">
        {Array.from({ length: rows }).map((_, idx) => (
          <li
            key={idx}
            className="flex gap-3 rounded-xl bg-card p-3"
          >
            <Skeleton className="size-24 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
