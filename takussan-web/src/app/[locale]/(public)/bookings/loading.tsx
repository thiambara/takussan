import { Skeleton } from '@/components/ui/skeleton';

/**
 * Squelette du tunnel de réservation public (TCK-438).
 *
 * ⚠️ **C'est la SEULE des quatre routes serveur publiques où un `loading.tsx` couvre réellement
 * l'attente, et la raison est structurelle, pas circonstancielle.**
 *
 * Un repli couvre exactement ce qui est *en dessous* de lui. Sur les trois fiches à slug, la seule
 * attente est l'aller-retour qui décide de l'existence — et cette décision doit rester *au-dessus*
 * du repli, sinon le statut HTTP part à 200 avant elle. Le repli n'y couvrirait donc que le rendu
 * postérieur aux données : un éclair de squelette juste avant le contenu, pas un état d'attente.
 * Le relevé qui établit les deux moitiés de ce raisonnement est dans
 * `[locale]/(public)/__tests__/pas-de-frontiere-de-suspension.test.ts`.
 *
 * `/bookings` n'a pas cette contrainte : **elle n'appelle jamais `notFound()`**. Un slug absent ou
 * introuvable y rend un `EmptyState` en 200, délibérément — la page est déjà `robots: index:false`,
 * elle n'a aucun statut à défendre. Le repli peut donc envelopper l'aller-retour lui-même, et c'est
 * ce qu'il fait.
 *
 * ⚠️ Sa géométrie recopie celle de la page — en-tête `h1` + sous-titre, puis le bloc du tunnel —
 * pour ne pas déplacer la mise en page à l'arrivée des données.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8" aria-hidden="true">
      <header className="mb-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Skeleton className="h-11 w-full rounded-full" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-border p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-2/3 rounded-lg" />
            </div>
          ))}
        </div>

        <aside className="space-y-4 rounded-2xl border border-border p-6">
          <Skeleton className="aspect-4/3 w-full rounded-xl" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </aside>
      </div>
    </div>
  );
}
