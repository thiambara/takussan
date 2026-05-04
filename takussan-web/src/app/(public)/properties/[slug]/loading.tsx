import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';

export default function Loading() {
  return (
    <>
      <Navbar />
      {/* Spacer : navbar fixed (~65px) + ligne catégories (~68px) */}
      <div className="h-[133px]" />
      <LoadingSkeleton />
      <Footer />
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="pb-24 lg:pb-12 animate-pulse">
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-8">
        <div className="h-4 w-2/3 sm:w-1/3 bg-stone-200 rounded" />
      </div>

      {/* Header — title + meta + actions */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 lg:mt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3 min-w-0 flex-1">
            <div className="h-8 bg-stone-200 rounded w-3/4" />
            <div className="h-5 bg-stone-200 rounded w-1/2" />
          </div>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <div className="h-9 w-24 bg-stone-200 rounded-full" />
            <div className="h-9 w-24 bg-stone-200 rounded-full" />
          </div>
        </div>
      </div>

      {/* Gallery mosaic — placeholder identical au layout 5+ photos */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 lg:mt-6">
        <div className="grid grid-cols-4 grid-rows-2 gap-2 aspect-[160/63] rounded-xl overflow-hidden">
          <div className="col-span-2 row-span-2 bg-stone-200" />
          <div className="bg-stone-200" />
          <div className="bg-stone-200" />
          <div className="bg-stone-200" />
          <div className="bg-stone-200" />
        </div>
      </div>

      {/* Body — main + aside */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 lg:mt-10 grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-10">
        <div className="space-y-8 min-w-0">
          {/* Specs strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 py-4 border-y border-stone-200">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="size-5 rounded-full bg-stone-200 shrink-0" />
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="h-3.5 bg-stone-200 rounded w-12" />
                  <div className="h-3 bg-stone-200 rounded w-16" />
                </div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="space-y-3">
            <div className="h-6 bg-stone-200 rounded w-40" />
            <div className="space-y-2">
              <div className="h-4 bg-stone-200 rounded w-full" />
              <div className="h-4 bg-stone-200 rounded w-11/12" />
              <div className="h-4 bg-stone-200 rounded w-5/6" />
              <div className="h-4 bg-stone-200 rounded w-3/4" />
            </div>
          </div>

          {/* Characteristics */}
          <div className="space-y-3">
            <div className="h-6 bg-stone-200 rounded w-48" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 bg-stone-200 rounded-lg" />
              ))}
            </div>
          </div>

          {/* Amenities */}
          <div className="space-y-3">
            <div className="h-6 bg-stone-200 rounded w-36" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 w-24 bg-stone-200 rounded-full" />
              ))}
            </div>
          </div>

          {/* Location map */}
          <div className="space-y-3">
            <div className="h-6 bg-stone-200 rounded w-40" />
            <div className="aspect-[16/9] bg-stone-200 rounded-xl" />
          </div>

          {/* Price history */}
          <div className="space-y-3">
            <div className="h-6 bg-stone-200 rounded w-44" />
            <div className="h-32 bg-stone-200 rounded-xl" />
          </div>

          {/* Documents */}
          <div className="space-y-3">
            <div className="h-6 bg-stone-200 rounded w-32" />
            <div className="space-y-2">
              <div className="h-12 bg-stone-200 rounded-lg" />
              <div className="h-12 bg-stone-200 rounded-lg" />
            </div>
          </div>

          {/* Reviews */}
          <div className="space-y-3">
            <div className="h-6 bg-stone-200 rounded w-32" />
            <div className="h-24 bg-stone-200 rounded-xl" />
            <div className="h-32 bg-stone-200 rounded-xl" />
          </div>

          {/* Report button */}
          <div className="pt-2">
            <div className="h-9 w-40 bg-stone-200 rounded-full" />
          </div>
        </div>

        {/* Aside */}
        <aside className="space-y-4">
          <div className="h-80 bg-stone-200 rounded-xl" />
          <div className="h-48 bg-stone-200 rounded-xl" />
        </aside>
      </div>

      {/* Similar properties + Recently viewed */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 space-y-12">
        {[0, 1].map((row) => (
          <div key={row} className="space-y-4">
            <div className="h-6 bg-stone-200 rounded w-56" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <div className="aspect-[4/3] bg-stone-200 rounded-xl" />
                  <div className="h-4 bg-stone-200 rounded w-1/2" />
                  <div className="h-4 bg-stone-200 rounded w-3/4" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
