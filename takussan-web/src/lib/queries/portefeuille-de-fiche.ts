import { rechercherBiensPublics } from '@/lib/queries/public-search';
import {
  clefDeRecherche,
  parametresDepuisNext,
  requeteAvecFixes,
} from '@/lib/recherche-publique';
import {
  parametresDuTotalDeFiche,
  parametresFixesDeFiche,
  type PerimetreDeFiche,
} from '@/lib/fiche-publique';
import type { GraineDeRecherche } from '@/hooks/useSearch';

export type PortefeuilleDeFiche = {
  /** Les paramètres fixes que la recherche du navigateur ajoutera à chaque requête. */
  readonly fixes: Readonly<Record<string, string>>;
  /** La première page, filtrée par l'URL — `null` sur panne : le client la redemande. */
  readonly graine: GraineDeRecherche | null;
  /**
   * Le « sur M » : tout le portefeuille CHERCHABLE (la recherche publique, `public()`), et non
   * `portfolio_total` de la fiche (`publicPortfolio()`, qui compte aussi les biens en attente) —
   * les deux nombres de « N sur M » sortent ainsi de la même source. `null` sur panne : la page
   * dit « N biens », jamais un « sur M » inventé.
   */
  readonly total: number | null;
};

/**
 * TCK-2522 / TCK-2523 — la première page du portefeuille d'une fiche, **rendue par le serveur avec
 * les filtres de l'URL** (`?contract_type=rent&bedrooms=2`) : un lien partagé rouvre la même
 * sélection, biens compris dans le HTML.
 *
 * Même construction que le navigateur (`requeteAvecFixes`), même clef : la graine est reprise à
 * l'hydratation sans second appel. Les deux requêtes partent ensemble.
 */
export async function chargerPortefeuilleDeFiche(
  perimetre: PerimetreDeFiche,
  searchParams: Readonly<Record<string, string | readonly string[] | undefined>>,
  locale: string,
): Promise<PortefeuilleDeFiche> {
  const fixes = parametresFixesDeFiche(perimetre);
  const clef = clefDeRecherche(requeteAvecFixes(parametresDepuisNext(searchParams), fixes));
  const clefDuTotal = clefDeRecherche(requeteAvecFixes(new URLSearchParams(), parametresDuTotalDeFiche(perimetre)));
  const [resultat, ensemble] = await Promise.all([
    rechercherBiensPublics(clef, locale),
    rechercherBiensPublics(clefDuTotal, locale),
  ]);
  return {
    fixes,
    graine: resultat ? { resultat, clef } : null,
    total: ensemble ? ensemble.meta.total : null,
  };
}
