'use client';

import { RetenirLaFiche } from '@/components/layout/RetenirLaFiche';
import { useVisit } from '@/lib/queries/visits';

/**
 * TCK-2846 — la fiche d'une visite entre dans les récents sous le titre de son bien (« Villa 4 chambres
 * à Ngor · Visite ») : jamais le nom, le téléphone ou le courriel du visiteur. Montée par la page, à côté
 * de la fiche (`components/visits`, tenue par un autre ticket) : la MÊME requête (`useVisit`, même clé),
 * déjà en cache, aucune lecture de plus.
 */
export function RetenirLaVisite({ id }: { readonly id: number }) {
  const visite = useVisit(id).data?.data;
  if (!visite) return null;
  return <RetenirLaFiche type="visite" id={visite.id} titre={visite.property?.title} chemin={`/app/visits/${visite.id}`} />;
}
