/**
 * TCK-2508 — le suivi des favoris : l'écart de prix depuis l'ajout, le prix retenu à l'ajout pour
 * l'anonyme, le lien de sélection partagée et le compte des biens nouveaux d'une recherche.
 *
 * Fonctions pures (sauf {@link retenirLePrixVuALAjout}, qui lit l'API publique) : la page et ses
 * tests partagent la même règle au lieu de la réécrire chacun.
 */
import { apiFetch } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { parametresDeRecherche } from '@/lib/recherche-publique';
import { retenirPrixALAjout, type FacettesDUnFavori } from '@/lib/favoritesStore';
import type { PropertyListItem } from '@/types/property';

/**
 * L'écart « prix courant − prix à l'ajout », ou `null` quand il ne se calcule pas (prix inconnu à
 * l'ajout, bien sans prix). Calculé en centimes : `0.1 + 0.2` ne doit pas produire un écart
 * fantôme de `0.0000001` qui afficherait une pastille.
 */
export function ecartDepuisLAjout(
  prixALAjout: number | null | undefined,
  prixCourant: number | null | undefined,
): number | null {
  if (typeof prixALAjout !== 'number' || !Number.isFinite(prixALAjout)) return null;
  if (typeof prixCourant !== 'number' || !Number.isFinite(prixCourant)) return null;
  return (Math.round(prixCourant * 100) - Math.round(prixALAjout * 100)) / 100;
}

/**
 * Une pastille ne s'affiche que pour un écart non nul : `null` (inconnu) et `0` (inchangé) ne
 * disent rien — jamais « 0 F » (AC1).
 */
export function ecartAffichable(ecart: number | null | undefined): ecart is number {
  return typeof ecart === 'number' && Number.isFinite(ecart) && ecart !== 0;
}

/**
 * Retient, pour l'anonyme, le prix PUBLIC du bien qu'il vient de mettre en favori.
 *
 * Lu par `by-ids`, qui n'émet que les biens publics : la règle de l'API (TCK-2507 — le prix
 * d'origine ne se prend que si le bien est public à l'ajout) vaut donc aussi ici. Lancé sans
 * `await` par le cœur : un échec réseau laisse simplement le favori sans écart, jamais sans cœur.
 */
export async function retenirLePrixVuALAjout(id: number): Promise<boolean> {
  try {
    const reponse = await apiFetch<{ data?: PropertyListItem[] }>(
      cheminApi`/public/properties/by-ids?ids=${id}`,
    );
    const bien = reponse?.data?.find((p) => p.id === id);
    if (!bien || typeof bien.price !== 'number') return false;
    return retenirPrixALAjout(id, bien.price);
  } catch {
    return false;
  }
}

/** La borne de `GET /api/public/properties/by-ids` (`BY_IDS_MAX_IDS`). */
export const SELECTION_PARTAGEE_MAX = 20;

/**
 * Les identifiants d'un lien `?ids=` : entiers positifs, sans doublon, dans l'ordre reçu, au plus
 * {@link SELECTION_PARTAGEE_MAX}. Ce qui n'est pas un identifiant est ignoré, jamais transmis.
 */
export function idsDeSelection(brut: string | null | undefined): number[] {
  if (!brut) return [];
  const vus = new Set<number>();
  for (const morceau of brut.split(',')) {
    const t = morceau.trim();
    if (!/^\d{1,10}$/.test(t)) continue;
    const id = Number(t);
    if (id > 0 && Number.isSafeInteger(id)) vus.add(id);
    if (vus.size >= SELECTION_PARTAGEE_MAX) break;
  }
  return [...vus];
}

/**
 * Le chemin (localisé) de la sélection partagée. Il ne porte QUE des identifiants de biens : ni
 * nom, ni note, ni identifiant de compte (contrainte : la vue partagée n'expose rien du
 * propriétaire de la sélection).
 */
export function cheminDeSelection(locale: string, ids: readonly number[]): string {
  const retenus = idsDeSelection(ids.join(','));
  return `/${locale}/favorites/shared?ids=${retenus.join(',')}`;
}

/**
 * Les `criteria` d'une recherche sauvegardée en chaîne de requête de `/properties` — la
 * sérialisation de la liste d'avant (`SavedSearchesList`, retirée par TCK-2738) : un tableau joint
 * par des virgules, un objet en JSON. Le résumé (`useResumeDeCriteres`) la relit.
 */
export function requeteDesCriteres(criteria: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(criteria).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else if (typeof value === 'object') {
      params.set(key, JSON.stringify(value));
    } else {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

/** Combien de vignettes de biens nouveaux une recherche montre sous son titre. */
export const VIGNETTES_DE_NOUVEAUX = 3;

/**
 * La requête qui compte les biens nouveaux d'une recherche (contrat de TCK-2507 / TCK-2496) :
 * ses critères, passés par la MÊME normalisation que la liste (`parametresDeRecherche`), puis
 * `published_after` (paramètre plat, strict), `placements=false` (aucune impression sponsorisée
 * pour une page que personne ne voit, ADR-0061 §10) et une petite page — on lit `meta.total`.
 *
 * Rend `null` quand il n'y a pas de date de référence : sans elle, « nouveau » ne veut rien dire.
 */
export function cheminDesNouveaux(
  criteria: Record<string, unknown>,
  depuis: string | null | undefined,
): string | null {
  if (!depuis) return null;
  const params = parametresDeRecherche(new URLSearchParams(requeteDesCriteres(criteria)));
  for (const cle of ['page', 'per_page', 'sort', 'published_after', 'placements', 'seed_hour', 'facets']) {
    params.delete(cle);
  }
  params.set('published_after', depuis);
  params.set('sort', 'created_desc');
  params.set('per_page', String(VIGNETTES_DE_NOUVEAUX));
  params.set('placements', 'false');
  return cheminApi`/api/public/properties/search${requete(params.toString())}`;
}

/**
 * « Biens proches » d'un favori éteint : la liste publique filtrée par ce que le bien était — sa
 * transaction, son type, sa ville, son quartier (`location`, le filtre de quartier de la liste).
 * Sans facettes connues, la liste sans filtre : mieux qu'un lien qui promettrait un lieu inventé.
 */
export function cheminDesBiensProches(facettes: FacettesDUnFavori | null | undefined): string {
  const params = new URLSearchParams();
  if (facettes?.contract_type) params.set('contract_type', facettes.contract_type);
  if (facettes?.type) params.set('type', facettes.type);
  if (facettes?.city) params.set('city', facettes.city);
  if (facettes?.quarter) params.set('location', facettes.quarter);
  const qs = params.toString();
  return `/properties${qs ? `?${qs}` : ''}`;
}

/** Le lieu d'une alerte « comme ceux-ci » et les critères qu'elle enregistre. */
export interface AlerteDeLaSelection {
  readonly lieu: string;
  readonly criteria: Readonly<Record<string, unknown>>;
}

/**
 * Le lieu le plus représenté d'une sélection — le quartier d'abord, la ville à défaut ; à égalité,
 * celui du bien le plus récent (la sélection arrive plus récent d'abord). Les critères reprennent
 * la transaction quand tous les biens de ce lieu la partagent : « comme ceux-ci » ne mêle pas
 * location et vente. `null` quand aucun bien ne dit où il est.
 */
export function alerteDeLaSelection(biens: readonly PropertyListItem[]): AlerteDeLaSelection | null {
  const choisir = (cle: 'quarter' | 'city'): string | null => {
    const comptes = new Map<string, number>();
    for (const b of biens) {
      const v = b.location?.[cle]?.trim();
      if (v) comptes.set(v, (comptes.get(v) ?? 0) + 1);
    }
    let meilleur: string | null = null;
    for (const [lieu, n] of comptes) if (meilleur === null || n > (comptes.get(meilleur) ?? 0)) meilleur = lieu;
    return meilleur;
  };
  const quartier = choisir('quarter');
  const cle = quartier ? 'quarter' : 'city';
  const lieu = quartier ?? choisir('city');
  if (!lieu) return null;
  const duLieu = biens.filter((b) => b.location?.[cle]?.trim() === lieu);
  const transactions = new Set(duLieu.map((b) => b.contract_type).filter(Boolean));
  const criteria: Record<string, unknown> = quartier ? { location: lieu } : { city: lieu };
  if (transactions.size === 1) criteria.contract_type = [...transactions][0];
  return { lieu, criteria };
}
