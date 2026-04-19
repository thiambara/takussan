export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <div className="h-4 w-40 bg-stone-200 rounded animate-pulse mb-6" />
      <div className="grid lg:grid-cols-[2fr_1fr] gap-10">
        <div className="space-y-4">
          <div className="aspect-[4/3] bg-stone-200 rounded-lg animate-pulse" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-square bg-stone-200 rounded animate-pulse" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-8 bg-stone-200 rounded w-3/4 animate-pulse" />
          <div className="h-6 bg-stone-200 rounded w-1/2 animate-pulse" />
          <div className="h-14 bg-stone-200 rounded animate-pulse" />
          <div className="h-32 bg-stone-200 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
