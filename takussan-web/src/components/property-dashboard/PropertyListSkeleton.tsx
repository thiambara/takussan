import { Skeleton } from '@/components/ui/skeleton';

export function PropertyListSkeleton({ rows = 5 }: { readonly rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-xl bg-card lg:block">
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
      {/* TCK-644 — les cartes valent jusqu'à `lg`, comme celles de la liste (le squelette
          basculait à `md`, où la liste montre encore des cartes). */}
      <ul className="space-y-3 lg:hidden">
        {Array.from({ length: rows }).map((_, idx) => (
          <li key={idx} className="rounded-2xl bg-card p-3 ring-1 ring-inset ring-border/70">
            <div className="flex gap-3">
              <Skeleton className="size-22 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-5 w-24" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-24" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
