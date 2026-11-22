import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
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
 * ⚠️ Sa géométrie recopie celle de la page — en-tête `h1` + ligne d'aide, le calendrier, et la carte
 * de récapitulatif en bureau (TCK-2510) —
 * pour ne pas déplacer la mise en page à l'arrivée des données — barre et cale comprises depuis
 * que la page porte la coque du site public (revue design du 2026-09-16).
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* TCK-2510 — comme la page : sous `lg`, le tunnel tient tout l'écran, sans la barre du site. */}
      <div className="hidden lg:block">
        <Navbar />
        <NavbarSpacer />
      </div>
      <div className="lg:mx-auto lg:grid lg:w-full lg:max-w-6xl lg:grid-cols-[1fr_380px] lg:gap-12 lg:px-8 lg:py-10" aria-hidden="true">
        <div>
          <header className="border-b border-border px-4 pb-3 pt-2 lg:border-0 lg:px-0 lg:pt-0">
            <Skeleton className="h-11 w-11 rounded-full lg:hidden" />
            <Skeleton className="mt-1 h-8 w-64 lg:mt-3 lg:h-10" />
            <Skeleton className="mt-2 h-4 w-72 max-w-full" />
          </header>
          <div className="grid gap-10 px-4 pt-6 lg:grid-cols-2 lg:px-0">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className={i === 1 ? 'hidden lg:block' : undefined}>
                <Skeleton className="mx-auto h-6 w-40" />
                <div className="mt-4 grid grid-cols-7 gap-2">
                  {Array.from({ length: 35 }).map((__, j) => (
                    <Skeleton key={j} className="mx-auto size-9 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside className="hidden space-y-4 rounded-2xl border border-border p-5 lg:block">
          <Skeleton className="size-14 rounded-xl" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </aside>
      </div>
    </div>
  );
}
