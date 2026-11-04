import { hrefLocalise } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';
import {
  CLES_DE_RECHERCHE,
  definitionDe,
  parametreDe,
  type CleDeRechercheNom,
  type CriteresDeSuggestion,
  type SearchFilters,
} from '@/types/search';

/**
 * TCK-2475 — d'une suggestion de `GET /api/search/suggest` à l'URL de la liste.
 *
 * Le serveur rend des `criteria` qui sont **des paramètres d'URL de la liste** (TCK-2474). Le front
 * ne les recopie pas tels quels : il les relit par les lecteurs de `SEARCH_FILTER_KEYS` et les
 * réécrit par ses écrivains — la même table que la barre latérale, les puces et la recherche
 * sauvegardée. Une clé que la table ne connaît pas, ou une clé de contrôle (`page`, `sort`), est
 * écartée : elle ne pourrait pas être affichée en puce ni retirée, ce que TCK-340 interdit.
 */

/** PHP sérialise un tableau associatif VIDE en `[]` : c'est un objet vide, pas une liste. */
export function criteresDeLaReponse(criteria: CriteresDeSuggestion | undefined | null): CriteresDeSuggestion {
  if (!criteria || Array.isArray(criteria) || typeof criteria !== 'object') return {};
  return criteria;
}

/** Les critères bruts sous forme d'URL, sans interprétation (la forme que relisent les lecteurs). */
function brut(criteria: CriteresDeSuggestion): URLSearchParams {
  const params = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(criteresDeLaReponse(criteria))) {
    if (valeur === undefined || valeur === null || valeur === '') continue;
    if (Array.isArray(valeur)) {
      if (valeur.length > 0) params.set(cle, valeur.join(','));
    } else if (typeof valeur !== 'object') {
      params.set(cle, String(valeur));
    }
  }
  return params;
}

/**
 * Les filtres de `source`, relus et réécrits par la table — clés filtrantes seulement, dans l'ordre de la table, chacune
 * sous son paramètre. `sauf` écarte des clés (le terme, pour la base d'une suggestion).
 */
function filtresRelus(source: URLSearchParams, sauf: readonly CleDeRechercheNom[] = []): URLSearchParams {
  const params = new URLSearchParams();
  for (const cle of CLES_DE_RECHERCHE) {
    const def = definitionDe(cle);
    if (def.role !== 'filtre' || sauf.includes(cle)) continue;
    const valeur = def.lire(source);
    if (valeur === undefined || valeur === '') continue;
    // `?price_max=abc` se relit `NaN` : l'envoyer ferait rendre 422 à l'API, et la barre se tairait.
    if (typeof valeur === 'number' && !Number.isFinite(valeur)) continue;
    const ecrit = def.ecrire(valeur);
    if (ecrit === undefined || ecrit === '') continue;
    params.set(def.params[0], ecrit);
  }
  return params;
}

/** Les critères, relus et réécrits par la table — clés filtrantes seulement, ordre de la table. */
export function parametresDeCriteres(criteria: CriteresDeSuggestion): URLSearchParams {
  return filtresRelus(brut(criteria));
}

/**
 * Revue adverse du 2026-11-04 (défaut n° 5) — la BASE d'une suggestion : les filtres que la navigation gardera (l'URL
 * courante et ce que l'appelant impose), envoyés à `GET /api/search/suggest` sous les noms de la liste publique pour que le
 * compte annoncé soit celui de la liste où l'on arrive. Ni le terme (`q`/`search` : c'est la saisie qui le remplace), ni
 * une clé de contrôle (page, tri), ni une clé que la table ne connaît pas. Ordre de la table : la chaîne sert aussi de clé
 * de cache, deux URL aux mêmes filtres donnent la même.
 *
 * Le serveur fusionne comme `parametresVersLaListe` : chaque critère compris REMPLACE la même clé de la base, une ville
 * comprise retire aussi le quartier, la région et les villes du profil (`cities`) d’avant, et les autres clés de la base restent.
 */
export function filtresDeLaBase(base: URLSearchParams): URLSearchParams {
  return filtresRelus(base, ['q']);
}

/**
 * Revue adverse du 2026-11-04 (défaut n° 9) — la liste s'élargira-t-elle sous ce compte nul ? `PropertySearchService`
 * n'élargit (ADR-0024) qu'un terme qui porte au moins DEUX mots utiles (`usefulTerms` : distincts une fois les accents et
 * la casse pliés, hors mots vides de l'index). Le serveur le dit quand il le sait (`widens`) ; sinon le front compte les
 * mots distincts du résidu — il ne recopie pas la liste des mots vides, qui ne vit que dans `config/scout.php`.
 */
export function laListeSElargira(interpretation: { readonly residue: string | null; readonly widens?: boolean }): boolean {
  if (typeof interpretation.widens === 'boolean') return interpretation.widens;
  const mots = (interpretation.residue ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(mots).size >= 2;
}

/**
 * Les paramètres de la liste pour une suggestion choisie : la `base` (les filtres déjà posés, et ce
 * que l'appelant impose), les critères compris par-dessus, et le texte restant en `q`.
 *
 * - le terme d'avant (`q` et son alias `search`) est REMPLACÉ : c'est la saisie qui vient d'être
 *   comprise qui le remplace, résidu compris ;
 * - une ville comprise retire le quartier et la région d'avant, comme une ville choisie dans la
 *   liste (`urlDeSuggestion`, TCK-439 et TCK-635) ;
 * - la pagination repart de la première page.
 */
export function parametresVersLaListe(
  criteria: CriteresDeSuggestion,
  texte: string | null | undefined,
  base: URLSearchParams,
): URLSearchParams {
  const params = new URLSearchParams(base.toString());
  for (const p of definitionDe('q').params) params.delete(p);
  params.delete(parametreDe('page'));
  const compris = parametresDeCriteres(criteria);
  if (compris.has(parametreDe('city'))) {
    params.delete(parametreDe('location'));
    params.delete(parametreDe('region'));
    // Les villes du profil (`cities`, en OU) s'ajouteraient en ET à la ville comprise : 0 bien.
    params.delete(parametreDe('cities'));
  }
  for (const [cle, valeur] of compris) params.set(cle, valeur);
  const terme = (texte ?? '').trim();
  if (terme) params.set(parametreDe('q'), terme);
  return params;
}

export function hrefDeListe(params: URLSearchParams, locale: Locale): string {
  const qs = params.toString();
  return hrefLocalise(`/properties${qs ? `?${qs}` : ''}`, locale);
}

/** Les filtres typés que décrivent ces paramètres — pour les puces et pour l'alerte. */
export function filtresDeParametres(params: URLSearchParams): SearchFilters {
  const filtres: Record<string, unknown> = {};
  for (const cle of CLES_DE_RECHERCHE) {
    const valeur = definitionDe(cle).lire(params);
    if (valeur !== undefined && valeur !== '') filtres[cle] = valeur;
  }
  return filtres as SearchFilters;
}

/** Les filtres typés d'une suggestion seule (sans la base de l'URL courante). */
export function filtresDeCriteres(criteria: CriteresDeSuggestion, texte?: string | null): SearchFilters {
  return filtresDeParametres(parametresVersLaListe(criteria, texte, new URLSearchParams()));
}
