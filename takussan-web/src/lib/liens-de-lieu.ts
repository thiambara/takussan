import { cheminCanoniqueDeLaListe, domainesStatiques } from '@/lib/canonique';
import { quartiersDeLaVille } from '@/lib/queries/facettes';

export type LienDeLieu = { readonly libelle: string; readonly href: string };

/**
 * Les liens « Quartiers de <ville> » d'une page de ville — TCK-916 (P35.02).
 *
 * Décision du porteur : chaque lien vise « une canonique présente au sitemap ». Le domaine est donc
 * celui que le sitemap lit (`quartiersDeLaVille`, seuil compris, en cache de données), et le chemin
 * sort de `cheminCanoniqueDeLaListe` avec ce domaine, comme dans `app/sitemap.ts` : un lien ne
 * peut pas désigner une variante que la page désavouerait.
 *
 * `villes` est le domaine des villes de la page (`villesDuCatalogue`). Domaine des quartiers
 * indisponible (`null`) ou vide : aucun lien, le bloc n'est pas rendu.
 */
export async function liensDesQuartiers(
  ville: string,
  villes: ReadonlyMap<string, string> | null,
): Promise<readonly LienDeLieu[]> {
  const quartiers = await quartiersDeLaVille(ville);
  if (!quartiers || quartiers.size === 0) return [];

  const domaines = { ...domainesStatiques(), villes, quartiers };
  return [...quartiers.values()]
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .map((quartier) => ({
      libelle: quartier,
      href: cheminCanoniqueDeLaListe(new URLSearchParams({ city: ville, location: quartier }), domaines),
    }));
}
