import { RouteSkeleton } from '@/components/console';

/**
 * TCK-426 — ce repli vit dans le GROUPE `(liste)`, et non plus à `maintenance/`.
 *
 * Posé un cran plus haut, il était l'ANCÊTRE de `maintenance/providers`, dont le
 * `layout.tsx` porte un refus d'autorisation. Or un repli d'ancêtre efface le statut d'un layout
 * descendant aussi sûrement que celui d'une page : mesuré sur Next 16.3.1 (sonde `anc/enfant`,
 * layout qui redirige sous un repli d'ancêtre → **200**, pas 307), puis CONFIRMÉ sur
 * l'application réelle — un prestataire recevait 200 sur `/app/maintenance/providers` quand
 * toutes les autres surfaces agence lui rendaient bien 307.
 *
 * *C'est la mesure de bout en bout qui a trouvé ce trou, pas la relecture : les quatorze layouts
 * étaient corrects, et deux d'entre eux étaient au mauvais étage.*
 *
 * Un groupe de routes ne consomme aucun segment d'URL : `/app/maintenance` reste servie par
 * `(liste)/page.tsx`, avec ce repli. Les sous-segments portent chacun le leur.
 */
export default function Loading() {
  return <RouteSkeleton variant="dashboard" />;
}
