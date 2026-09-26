import { Skeleton } from 'takussan';

export function PropertyCardLoading() {
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <Skeleton className="aspect-[4/3] w-full rounded-xl" />
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function ListRowLoading() {
  return (
    <div className="flex max-w-md flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
