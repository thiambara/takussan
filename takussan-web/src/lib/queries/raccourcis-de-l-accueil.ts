import { HOMEPAGE_DISCOVERY_PER_ROW } from '@/lib/rangees-de-l-accueil';
import { rechercherBiensPublics } from '@/lib/queries/public-search';
import type { PropertyListItem } from '@/types/property';

/**
 * Les sections de l'accueil lues par le SERVEUR seul, hors de l'appel unique des rangées
 * (`/public/properties/discovery`). Il n'en reste qu'une : « À vendre », sur la recherche publique
 * (`GET /public/properties/search?contract_type=sale`), un endpoint qui existait déjà (TCK-628).
 *
 * ⚠ Les tuiles « Par ville », « Par type de bien » et les pastilles « Quartiers prisés » ont été
 * retirées le 2026-10-10, à la demande du porteur, qui les trouvait moins belles que des rangées
 * de cartes. Les domaines qu'elles lisaient restent servis à `/properties` et au sitemap.
 *
 * ⚠ **La section rend `null` en cas de panne**, et disparaît alors de la page : c'est le contrat
 * de `decouverteDeLAccueil` (une page publique doit rester servable). Le client ne la redemande
 * pas : elle ne dépend pas de la ville devinée.
 */
export interface RaccourcisDeLAccueil {
  readonly vente: readonly PropertyListItem[] | null;
}

export const AUCUN_RACCOURCI: RaccourcisDeLAccueil = { vente: null };

async function biensAVendre(locale: string): Promise<readonly PropertyListItem[] | null> {
  // `rechercherBiensPublics` rend déjà `null` en cas de panne, et journalise.
  const resultat = await rechercherBiensPublics(
    `contract_type=sale&per_page=${HOMEPAGE_DISCOVERY_PER_ROW}`,
    locale,
  );
  const biens = resultat?.data;
  return Array.isArray(biens) && biens.length > 0 ? biens : null;
}

export async function raccourcisDeLAccueil(locale: string): Promise<RaccourcisDeLAccueil> {
  return { vente: await biensAVendre(locale) };
}
