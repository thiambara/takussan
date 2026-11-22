/**
 * TCK-2522 / TCK-2523 — ce que les fiches publiques d'agence et de personne partagent, hors React :
 * le périmètre de leur recherche, le seuil de la recherche d'agent, l'abréviation d'un nom, le délai
 * de réponse et les élargissements de l'état « aucun bien ».
 *
 * Module pur (ni `'use client'` ni `server-only`) : le rendu serveur et la recherche du navigateur
 * doivent construire la MÊME requête, sans quoi la graine serait redemandée à l'hydratation.
 */
import type { FacetteDeRecherche, SearchFilters, SearchResult } from '@/types/search';

/** Les comptes par option que demandent les fiches — toutes les facettes que l'API accepte. */
export const FACETTES_DE_FICHE = 'contract_type,type,bedrooms,neighborhood';

/** Une page de fiche : douze lignes, puis « Voir N biens de plus ». */
export const BIENS_PAR_PAGE_DE_FICHE = 12;

/**
 * TCK-2523 — la recherche n'apparaît sur la fiche d'une personne qu'AU-DELÀ de six biens : en
 * dessous, la liste se lit d'un coup d'œil et un champ de recherche n'y trouverait rien de plus.
 */
export const SEUIL_DE_RECHERCHE_D_AGENT = 6;

export function aUneRecherche(totalDesBiens: number): boolean {
  return totalDesBiens > SEUIL_DE_RECHERCHE_D_AGENT;
}

export type PerimetreDeFiche = { readonly agency: string } | { readonly agent: string };

/**
 * Les paramètres d'API AJOUTÉS à chaque requête d'une fiche, jamais écrits dans son URL : le
 * périmètre, aucun emplacement sponsorisé (TCK-2517 : la page servirait sinon en « Sponsorisé » les
 * vedettes de l'agence elle-même), les facettes et la taille de page.
 */
export function parametresFixesDeFiche(perimetre: PerimetreDeFiche): Record<string, string> {
  return {
    ...perimetre,
    placements: 'false',
    facets: FACETTES_DE_FICHE,
    per_page: String(BIENS_PAR_PAGE_DE_FICHE),
  };
}

/** Le « sur M » : tout le portefeuille cherchable, sans filtre, une seule ligne demandée. */
export function parametresDuTotalDeFiche(perimetre: PerimetreDeFiche): Record<string, string> {
  return { ...perimetre, placements: 'false', per_page: '1' };
}

/**
 * TCK-2523 (décision 1b) — le nom d'un propriétaire rendu public : le prénom et l'initiale du nom
 * (« Sokhna G. »). Le prénom seul quand il n'y a pas de nom ; le nom complet de l'API en dernier
 * recours seulement s'il n'y a pas de prénom séparé, réduit de la même façon.
 */
export function nomAbrege(prenom: string | null | undefined, nom: string | null | undefined, complet: string): string {
  const p = (prenom ?? '').trim();
  const n = (nom ?? '').trim();
  if (p !== '') return n !== '' ? `${p} ${n.charAt(0).toUpperCase()}.` : p;
  const parties = complet.trim().split(/\s+/).filter(Boolean);
  if (parties.length === 0) return '';
  if (parties.length === 1) return parties[0];
  return `${parties[0]} ${parties[parties.length - 1].charAt(0).toUpperCase()}.`;
}

/** Les initiales d'un nom affiché (monogramme, avatar en repli). */
export function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((partie) => partie.charAt(0).toUpperCase())
    .join('');
}

/**
 * TCK-2518 — le délai de réponse en une unité lisible, ou `null` : rien à afficher. Une médiane
 * absente (sous le seuil de fils, ou tombée sur l'infini) n'est pas « 0 » — décision de la session.
 */
export function delaiDeReponse(
  minutes: number | null | undefined,
): { readonly unite: 'minutes' | 'heures' | 'jours'; readonly valeur: number } | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return { unite: 'minutes', valeur: Math.max(1, Math.round(minutes)) };
  const heures = Math.round(minutes / 60);
  if (heures < 24) return { unite: 'heures', valeur: heures };
  return { unite: 'jours', valeur: Math.round(minutes / 1440) };
}

/** La somme d'une facette — le total sans le filtre qu'elle porte, quand chaque bien a une valeur. */
function somme(facette: readonly FacetteDeRecherche[] | undefined): number | null {
  if (!facette) return null;
  return facette.reduce((n, option) => n + (Number.isFinite(option.count) ? option.count : 0), 0);
}

export type Elargissement = {
  /** Le filtre que l'élargissement retire. */
  readonly cle: 'contract_type' | 'type';
  readonly compte: number;
};

/**
 * TCK-2522 · AC3 — les élargissements de l'état « aucun bien », comptés par les FACETTES de l'API.
 *
 * Chaque facette est calculée sous tous les filtres sauf le sien : la somme de `contract_type` est
 * donc le nombre de biens si l'on retire la transaction, celle de `type` si l'on retire le type —
 * exactement, parce que tout bien a une transaction et un type. Les deux autres facettes ne
 * donnent PAS un compte sûr, et sont écartées délibérément :
 *
 * - `neighborhood` ne compte que les biens qui ont un quartier ; retirer le quartier ramène aussi
 *   ceux qui n'en ont pas — la somme serait un plancher présenté comme un compte ;
 * - `bedrooms` est cumulé et ignore les biens sans chambre déclarée, que le retrait ramène aussi.
 *
 * Seuls les élargissements qui rendent au moins un bien sont proposés : « 0 bien » n'élargit rien.
 */
export function elargissementsDeFiche(
  filtres: SearchFilters,
  facettes: SearchResult['meta']['facets'],
): Elargissement[] {
  const proposes: Elargissement[] = [];
  if (filtres.contract_type) {
    const compte = somme(facettes?.contract_type);
    if (compte !== null && compte > 0) proposes.push({ cle: 'contract_type', compte });
  }
  if (filtres.type && filtres.type.length > 0) {
    const compte = somme(facettes?.type);
    if (compte !== null && compte > 0) proposes.push({ cle: 'type', compte });
  }
  return proposes;
}

/**
 * Le compte « N chambres et plus » d'une facette CUMULÉE : celui de la plus petite valeur servie
 * qui atteint le seuil (l'API ne sert que les valeurs présentes : sans bien à 4 chambres, « 4+ »
 * vaut le compte de la valeur 5). Aucun bien au-dessus : 0.
 */
export function compteDesChambres(facette: readonly FacetteDeRecherche[] | undefined, minimum: number): number {
  if (!facette) return 0;
  const candidates = facette
    .map((option) => ({ valeur: Number(option.value), compte: option.count }))
    .filter((option) => Number.isFinite(option.valeur) && option.valeur >= minimum)
    .sort((a, b) => a.valeur - b.valeur);
  return candidates[0]?.compte ?? 0;
}

/** Le compte d'une option d'une facette (0 si elle n'est pas servie). */
export function compteDe(facette: readonly FacetteDeRecherche[] | undefined, valeur: string): number {
  return facette?.find((option) => String(option.value) === valeur)?.count ?? 0;
}
