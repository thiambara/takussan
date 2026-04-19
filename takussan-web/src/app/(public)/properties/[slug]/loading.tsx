export default function Loading() {
  return (
    <div className="pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 lg:pt-8 animate-pulse">
        <div className="h-4 w-2/3 sm:w-1/3 bg-stone-200 rounded" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 lg:mt-6 animate-pulse space-y-3">
        <div className="h-8 bg-stone-200 rounded w-3/4" />
        <div className="h-5 bg-stone-200 rounded w-1/2" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 lg:mt-6 animate-pulse">
        <div className="grid grid-cols-4 grid-rows-2 gap-2 aspect-[16/9] rounded-xl overflow-hidden">
          <div className="col-span-2 row-span-2 bg-stone-200" />
          <div className="bg-stone-200" />
          <div className="bg-stone-200" />
          <div className="bg-stone-200" />
          <div className="bg-stone-200" />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 lg:mt-10 grid lg:grid-cols-[1fr_380px] gap-6 lg:gap-10 animate-pulse">
        <div className="space-y-6 min-w-0">
          <div className="h-20 bg-stone-200 rounded-xl" />
          <div className="space-y-2">
            <div className="h-5 bg-stone-200 rounded w-1/4" />
            <div className="h-4 bg-stone-200 rounded w-full" />
            <div className="h-4 bg-stone-200 rounded w-5/6" />
            <div className="h-4 bg-stone-200 rounded w-4/6" />
          </div>
          <div className="h-40 bg-stone-200 rounded-xl" />
          <div className="h-32 bg-stone-200 rounded-xl" />
          <div className="h-64 bg-stone-200 rounded-xl" />
          <div className="h-40 bg-stone-200 rounded-xl" />
        </div>
        <div className="space-y-4">
          <div className="h-64 bg-stone-200 rounded-xl" />
          <div className="h-48 bg-stone-200 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
