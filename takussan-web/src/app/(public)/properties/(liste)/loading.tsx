import { Navbar } from '@/components/home/Navbar';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * ⚠️ **Ce fichier vit dans un GROUPE DE ROUTES `(liste)`, et ce n'est pas cosmétique.**
 *
 * Un `loading.tsx` ouvre une frontière de suspension sur son segment **et tous ses enfants**.
 * Posé directement sous `properties/`, il couvrait donc aussi `properties/[slug]` — et la coque
 * partait alors immédiatement avec le repli, **statut HTTP compris**. Conséquence mesurée le
 * 2026-08-21, par ablation, sur `next dev` comme sur `next start` : une fiche inexistante rendait
 * le bon écran « Bien introuvable »… en **HTTP 200**. `notFound()` arrivait après le premier
 * octet, et un code de statut ne se rattrape pas.
 *
 *     sonde `notFound()` nue sous /properties, SANS ce fichier  → 404
 *     la même, AVEC ce fichier à la racine du segment           → 200
 *
 * Le groupe `(liste)` ne change pas l'URL et confine la frontière à la seule page de résultats.
 * *Un soft-404 servi en 200 aux moteurs est exactement le défaut que TCK-335 répare ailleurs ;
 * il aurait été réintroduit ici par le correctif lui-même.*
 */
/**
 * Squelette de `/properties` (TCK-335, étape 6).
 *
 * `find src/app -name loading.tsx | wc -l` en comptait **2 pour 113 pages** au 2026-08-21, et
 * `/properties` — la surface la plus parcourue du site public — n'en avait pas. Sans lui, une
 * navigation vers les résultats laisse **la page précédente figée** jusqu'à l'arrivée du nouveau
 * rendu : l'utilisateur clique et rien ne bouge.
 *
 * Le même arbre sert de `fallback` au `<Suspense>` de `page.tsx`, qui était écrit **sans fallback**
 * — c'est-à-dire avec `undefined`, donc sans rien à montrer pendant la suspension. Les deux
 * emplacements couvrent deux instants différents (la navigation, puis la suspension du sous-arbre
 * client) et se lisent ensemble ; c'est pourquoi le squelette est exporté plutôt que dupliqué.
 *
 * ⚠️ Sa géométrie recopie celle de `PropertiesDiscoveryPage` — spacer `h-[133px]` sous la navbar
 * fixe, rail de filtres de 280 px, grille 2/3/4/5 colonnes. Un squelette qui ne fait pas la
 * hauteur du contenu déplace la page à l'arrivée des données, ce qui coûte plus cher que pas de
 * squelette du tout.
 */
export function PropertiesSkeleton() {
  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      {/* Spacer : navbar fixed (~65px) + ligne catégories (~68px) */}
      <div className="h-[133px]" />

      <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-16 py-8">
        <div className="flex gap-6 items-start">
          <aside className="hidden lg:block w-[280px] shrink-0 space-y-6" aria-hidden="true">
            <Skeleton className="h-9 w-2/3" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))}
          </aside>

          <main className="flex-1 min-w-0" aria-hidden="true">
            <div className="flex items-center justify-between gap-4 mb-8">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-9 w-48 rounded-full" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-x-4 gap-y-12">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-4/3 w-full rounded-xl" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function Loading() {
  return <PropertiesSkeleton />;
}
