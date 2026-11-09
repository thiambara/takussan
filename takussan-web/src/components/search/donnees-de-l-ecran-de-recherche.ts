'use client';

import { useQueries, useQuery } from '@tanstack/react-query';
import { useApiQuery } from '@/hooks/useApiQuery';
import { apiFetch } from '@/lib/api';
import { parametresDeRecherche } from '@/lib/recherche-publique';
import { UNE_HEURE_MS } from '@/lib/queries/referentiel-public';
import type { RechercheRecente } from '@/lib/recherches-recentes';

/**
 * TCK-2497 — ce que l'écran de recherche « Riche et complet » montre AVANT la frappe, et que la
 * suggestion ne rend pas (mesuré : `GET /api/search/suggest?q=` → `places: []`).
 *
 * Toutes facultatives : une panne ou une réponse vide retire le groupe, jamais l'écran.
 *
 *  · **quartiers populaires** et **types de bien** : la facette (`facets=neighborhood|type`, TCK-2517) de
 *    la liste SOUS la base — filtres gardés et transaction compris. Revue adverse : la première version
 *    lisait les domaines globaux (`/public/property-types`…) et annonçait « Villa 28 » pour une liste
 *    de 15. La ville des quartiers est celle de la base, sinon la plus fournie du catalogue ;
 *  · **« N nouveaux »** d'une récente : le total de la liste sous ses paramètres et `published_after`
 *    = sa dernière date (TCK-2496), `per_page=1`, `placements=false` (sans quoi chaque compte servirait
 *    des emplacements et compterait des impressions pour une page que personne ne voit, ADR-0061 §10).
 */

type Domaine = { readonly data: readonly { readonly value: string; readonly count: number }[] };

export interface ValeurComptee {
  readonly valeur: string;
  readonly compte: number;
}

/** Les quartiers proposés avant la frappe, au plus. */
export const QUARTIERS_POPULAIRES_MAX = 8;
/** Les récentes dont on compte les nouveaux, au plus : une requête par récente. */
export const NOUVEAUX_COMPTES_MAX = 3;

/**
 * La ville des « quartiers populaires » : celle de la base (l'URL de la liste), sinon la plus fournie du
 * catalogue. Le compte du catalogue ne sert qu'à CHOISIR la ville ; il ne s'affiche nulle part.
 */
export function useVilleDesQuartiers(actif: boolean, villeDeLaBase: string | null): string | null {
  const villes = useApiQuery<Domaine>(['search', 'ecran', 'villes'], '/api/public/properties/cities', {
    enabled: actif && !villeDeLaBase,
    staleTime: UNE_HEURE_MS,
  });
  return villeDeLaBase ?? villes.data?.data.find((v) => v.value && v.count > 0)?.value ?? null;
}

/** Les facettes que l'écran compte SOUS la base (`SearchPublicPropertyRequest::FACETTES`). */
export type FacetteDeLEcran = 'type' | 'neighborhood';

/** Le paramètre de liste qu'une facette ignore pour se compter (`FILTRES_D_UNE_FACETTE` côté API). */
const PARAMETRE_DE_LA_FACETTE: Record<FacetteDeLEcran, string> = { type: 'type', neighborhood: 'location' };

/**
 * Revue de TCK-2497 — la requête qui compte, par option, les biens de la liste qu'ouvrira la pastille.
 *
 * `qsDeLaListe` est l'URL que la pastille ouvrirait, À SA VALEUR PRÈS (même base, mêmes filtres gardés,
 * même transaction : l'appelant la construit par `urlDeSuggestion`, celle-là même qu'emprunte le geste).
 * L'API compte chaque option de la facette hors de son propre filtre (`FILTRES_D_UNE_FACETTE`) : le compte
 * de l'option V est donc, par construction, le `meta.total` de cette liste avec V posé.
 * `per_page=1` et `fields[properties]=id` : seul `meta` est lu ; `placements=false` : aucune impression.
 */
export function requeteDeFacette(qsDeLaListe: string, facette: FacetteDeLEcran): string {
  const params = parametresDeRecherche(new URLSearchParams(qsDeLaListe));
  params.delete(PARAMETRE_DE_LA_FACETTE[facette]);
  params.delete('page');
  params.set('per_page', '1');
  params.set('fields[properties]', 'id');
  params.set('placements', 'false');
  params.set('facets', facette);
  return `/public/properties/search?${params.toString()}`;
}

type ReponseDeFacettes = {
  readonly meta?: { readonly facets?: Readonly<Record<string, readonly { readonly value: string | number; readonly count: number }[]>> };
};

/**
 * Les options d'une facette avec leur compte SOUS la base, du plus grand au plus petit, sans les vides.
 * `null` — requête absente, en cours, refusée, ou facette que l'API n'a pas comptée : le groupe ne
 * s'affiche pas. **Jamais de repli sur un compte global** : il annoncerait une liste qu'on n'ouvre pas.
 */
export function useFacette(
  actif: boolean,
  requete: string | null,
  facette: FacetteDeLEcran,
): readonly ValeurComptee[] | null {
  const lu = useQuery({
    queryKey: ['search', 'ecran', 'facette', requete],
    queryFn: () => apiFetch<ReponseDeFacettes>(requete!),
    enabled: actif && requete !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const options = lu.data?.meta?.facets?.[facette];
  if (!actif || requete === null || !Array.isArray(options)) return null;
  const liste = options
    .filter((o) => String(o.value) !== '' && o.count > 0)
    .map((o) => ({ valeur: String(o.value), compte: o.count }))
    .sort((a, b) => b.compte - a.compte);
  return liste.length > 0 ? liste : null;
}

/** La requête de liste qui compte les biens publiés depuis `vue` sous les paramètres d'une récente. */
export function requeteDesNouveaux(qs: string, vue: string): string {
  const params = parametresDeRecherche(new URLSearchParams(qs));
  params.set('per_page', '1');
  params.delete('page');
  params.set('placements', 'false');
  // Sparse fieldset : seul `meta.total` est lu (revue de TCK-2497 — sans lui, un bien entier était servi).
  params.set('fields[properties]', 'id');
  params.set('published_after', vue);
  return `/public/properties/search?${params.toString()}`;
}

/**
 * Le nombre de biens arrivés depuis la dernière visite de chaque récente datée, par `qs`. Absent :
 * récente sans date, compte en cours, ou refusé (une horloge en avance rend 422 — `published_after`
 * ne vaut pas dans le futur) : rien ne s'affiche.
 */
export function useNouveauxDepuis(
  actif: boolean,
  recentes: readonly RechercheRecente[],
  vues: Readonly<Record<string, string>>,
): ReadonlyMap<string, number> {
  const datees = recentes.filter((r) => vues[r.qs]).slice(0, NOUVEAUX_COMPTES_MAX);
  const resultats = useQueries({
    queries: datees.map((r) => ({
      queryKey: ['search', 'ecran', 'nouveaux', r.qs, vues[r.qs]],
      queryFn: () => apiFetch<{ meta?: { total?: number } }>(requeteDesNouveaux(r.qs, vues[r.qs]!)),
      enabled: actif,
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const comptes = new Map<string, number>();
  datees.forEach((r, i) => {
    const total = resultats[i]?.data?.meta?.total;
    if (typeof total === 'number') comptes.set(r.qs, total);
  });
  return comptes;
}
