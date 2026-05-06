import { PropertyListSkeleton } from '@/components/property-dashboard/PropertyListSkeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-app-surface-2/70" />
        <div className="h-4 w-72 animate-pulse rounded bg-app-surface-2/50" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-app-surface-2/40" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-xl bg-app-surface-2/40" />
      <PropertyListSkeleton />
    </div>
  );
}
