import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';

/**
 * TCK-2590 — le squelette suit la liste : au téléphone, les pastilles des vues, la ligne de tri et
 * des lignes de 96 px (initiales, deux lignes, deux gestes) ; dès `lg`, la tête de page, la barre
 * des vues et des filtres, puis la carte du tableau.
 */
export default function Loading() {
  return (
    <PagePleineLargeur aria-busy="true" className="max-md:pb-6">
      <div className="space-y-2 max-md:hidden">
        <div className="h-8 w-40 animate-pulse rounded bg-muted/70" />
        <div className="h-4 w-72 animate-pulse rounded bg-muted/50" />
        <div className="hidden h-9 w-full animate-pulse rounded-lg bg-muted/40 lg:block" />
      </div>
      <div className="flex gap-2 overflow-hidden border-b border-border px-4 py-2.5 md:mt-5 md:px-0 lg:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-28 shrink-0 animate-pulse rounded-full bg-muted/40" />
        ))}
      </div>
      <ul className="lg:hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <li key={i} className="flex min-h-24 items-center gap-3 border-b border-border py-2.5 pr-3 pl-4">
            <div className="size-11 shrink-0 animate-pulse rounded-full bg-muted/60" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-36 animate-pulse rounded bg-muted/60" />
              <div className="h-3.5 w-48 animate-pulse rounded bg-muted/40" />
              <div className="h-3 w-40 animate-pulse rounded bg-muted/40" />
            </div>
            <div className="size-11 shrink-0 animate-pulse rounded-full bg-muted/40" />
            <div className="size-11 shrink-0 animate-pulse rounded-full bg-muted/40" />
          </li>
        ))}
      </ul>
      <div className="hidden pt-6 lg:block">
        <div className="space-y-px overflow-hidden rounded-xl border border-border bg-card">
          <div className="h-10 bg-muted/40" />
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex h-14 items-center gap-3 px-4">
              <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted/60" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted/50" />
              <div className="h-4 flex-1 animate-pulse rounded bg-muted/30" />
            </div>
          ))}
        </div>
      </div>
    </PagePleineLargeur>
  );
}
