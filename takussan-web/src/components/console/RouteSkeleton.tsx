import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Le repli des `loading.tsx` du tableau de bord — une forme par SORTE d'écran, pas une par écran.
 *
 * ## Pourquoi une forme et non une roue
 *
 * `docs/design-guidelines.md:93` refuse le spinner pleine page hors première charge. La raison
 * n'est pas esthétique : un repli qui ne ressemble pas à ce qui arrive **remplace une attente par
 * un clignotement** — la page saute au moment où le contenu se substitue au repli, parce que les
 * deux n'occupent pas la même place. Chaque variante ci-dessous reprend donc la structure réelle
 * de sa famille d'écrans : le nombre de blocs, leur ordre et leurs hauteurs sont relevés sur les
 * pages qu'elle couvre, pas choisis.
 *
 * ## Pourquoi cinq variantes et pas quarante
 *
 * Les 46 écrans de `/app` se rangent en cinq dispositions, et c'est une mesure, pas un
 * arrondi : liste (en-tête + filtres + rangées), tableau de bord (en-tête + tuiles + panneaux),
 * fiche (fil d'ariane + titre + badges + onglets), formulaire (en-tête + champs + barre
 * d'actions), tableau kanban (colonnes). Un `loading.tsx` par écran aurait figé 46 copies d'une
 * même esquisse ; c'est le motif qu'`EmptyState` a payé — 41 états vides en 23 `className`.
 *
 * ## Ce composant est DÉCORATIF, et le dit
 *
 * `aria-hidden="true"` sur le conteneur, comme les squelettes de `DataState`. Une esquisse n'a
 * aucun contenu à annoncer, et l'annonce du changement de route est déjà tenue par le route
 * announcer de Next. Un `role="status"` sans libellé n'annoncerait rien tout en réclamant qu'on
 * l'entende.
 *
 * ⚠ Il ne prend NI traduction NI donnée : un `loading.tsx` doit rendre au premier tick, et tout
 * `await` qu'il ferait — `getTranslations()` compris — suspendrait le repli lui-même, donc
 * n'afficherait rien du tout pendant qu'il attend.
 */
export type RouteSkeletonVariant = 'list' | 'dashboard' | 'detail' | 'form' | 'board';

export interface RouteSkeletonProps {
  readonly variant: RouteSkeletonVariant;
  /** Nombre de rangées / tuiles / champs, selon la variante. Défaut relevé par variante. */
  readonly rows?: number;
  readonly className?: string;
}

function EnTete() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
    </div>
  );
}

export function RouteSkeleton({ variant, rows, className }: RouteSkeletonProps) {
  return (
    <div className={cn('space-y-6', className)} aria-hidden="true" data-testid="route-skeleton" data-variant={variant}>
      <EnTete />
      {variant === 'list' ? <CorpsListe rows={rows ?? 6} /> : null}
      {variant === 'dashboard' ? <CorpsTableauDeBord rows={rows ?? 4} /> : null}
      {variant === 'detail' ? <CorpsFiche /> : null}
      {variant === 'form' ? <CorpsFormulaire rows={rows ?? 6} /> : null}
      {variant === 'board' ? <CorpsKanban rows={rows ?? 4} /> : null}
    </div>
  );
}

function CorpsListe({ rows }: { readonly rows: number }) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b border-border/60 px-4 py-4 last:border-b-0">
            <Skeleton className="size-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="hidden h-5 w-24 sm:block" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
    </>
  );
}

function CorpsTableauDeBord({ rows }: { readonly rows: number }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </>
  );
}

function CorpsFiche() {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-28 rounded-full" />
      </div>
      <div className="flex gap-2 border-b border-border pb-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </>
  );
}

function CorpsFormulaire({ rows }: { readonly rows: number }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-6">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}

function CorpsKanban({ rows }: { readonly rows: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: rows }).map((_, colonne) => (
        <div key={colonne} className="space-y-3 rounded-xl border border-border bg-card p-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
