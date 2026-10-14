import { RESERVE_SOUS_LANCEUR } from '@/components/chat-widget/reserve';
import { PropertyListSkeleton } from '@/components/property-dashboard/PropertyListSkeleton';
import { cn } from '@/lib/utils';

/**
 * TCK-644 — le squelette suit la mise en page mobile de la page : en-tête sur une rangée, rangée
 * de pastilles, recherche + « Filtres ». Dès `lg`, la mise en page d'ordinateur d'origine.
 */
export default function Loading() {
  return (
    <div className={cn('space-y-4 lg:space-y-6', RESERVE_SOUS_LANCEUR)}>
      <div className="flex items-center justify-between gap-3 lg:items-start">
        <div className="space-y-2">
          <div className="h-7 w-40 animate-pulse rounded bg-muted/70" />
          <div className="hidden h-4 w-72 animate-pulse rounded bg-muted/50 sm:block" />
        </div>
        <div className="h-10 w-36 shrink-0 animate-pulse rounded-xl bg-muted/70 lg:h-9 lg:rounded-lg" />
      </div>
      <div className="-mx-4 flex gap-2 overflow-hidden px-4 md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-3 lg:px-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-28 shrink-0 animate-pulse rounded-full bg-muted/40 lg:h-20 lg:w-auto lg:rounded-xl"
          />
        ))}
      </div>
      <div className="flex gap-2 lg:block">
        <div className="h-11 min-w-0 flex-1 animate-pulse rounded-xl bg-muted/40 lg:h-32" />
        <div className="h-11 w-28 shrink-0 animate-pulse rounded-xl bg-muted/40 lg:hidden" />
      </div>
      <PropertyListSkeleton />
    </div>
  );
}
