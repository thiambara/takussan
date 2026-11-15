'use client';

import { useContext } from 'react';
import { QueryClientContext, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { apiFetch } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { filtersToParams } from '@/hooks/useSearch';
import { cn } from '@/lib/utils';
import type { SearchFilters } from '@/types/search';

/**
 * TCK-2499 — la répartition des prix de la recherche, au-dessus des bornes du budget : on voit où
 * sont les biens avant de choisir son plafond.
 *
 * Contrat (TCK-2498) : `GET /api/public/properties/price-distribution?contract_type=…&<filtres plats
 * de la liste>` → `{ data: { buckets: [{from, to, count}], min, max } }`, tranches `[from, to[`.
 * `contract_type` est OBLIGATOIRE (422 sans lui) : sans transaction choisie, un loyer et un prix de
 * vente n'ont pas d'échelle commune, et l'histogramme n'est pas rendu. En location sans
 * `rent_period`, l'API compte le loyer AU MOIS (implicite ou déclaré) — le front n'a rien à ramener.
 */

/** Les paramètres de la liste que la répartition ne lit pas (notes de TCK-2498). */
const CLES_HORS_REPARTITION = [
  'price_min', 'price_max', 'sort', 'page', 'per_page', 'placements', 'seed_hour', 'published_after', 'facets',
] as const;

export interface TrancheDePrix {
  readonly from: number;
  readonly to: number;
  readonly count: number;
}

interface Repartition {
  readonly buckets: readonly TrancheDePrix[];
  readonly min: number | null;
  readonly max: number | null;
}

/** La requête de la répartition pour ces filtres, ou `null` s'il n'y a pas de transaction. */
export function requeteDeRepartition(filters: SearchFilters): string | null {
  if (!filters.contract_type) return null;
  const params = filtersToParams(filters);
  for (const cle of CLES_HORS_REPARTITION) params.delete(cle);
  params.sort();
  return params.toString();
}

/**
 * La borne sous laquelle se trouve AU MOINS la moitié des biens : la fin de la première tranche où
 * le cumul atteint la moitié. Vraie par construction (`[from, to[`) — jamais une médiane estimée.
 */
export function borneDeLaMoitie(tranches: readonly TrancheDePrix[]): number | null {
  const total = tranches.reduce((s, t) => s + t.count, 0);
  if (total === 0) return null;
  let cumul = 0;
  for (const t of tranches) {
    cumul += t.count;
    if (cumul * 2 >= total) return t.to;
  }
  return null;
}

/** Une tranche est « dans le budget » si elle recoupe `[min, max]`. */
export function dansLeBudget(t: TrancheDePrix, min?: number, max?: number): boolean {
  return (min === undefined || t.to > min) && (max === undefined || t.from <= max);
}

export interface HistogrammeDesPrixProps {
  readonly filters: SearchFilters;
  /** Les bornes AFFICHÉES (brouillons compris) : la mise en relief suit la saisie. */
  readonly min?: number;
  readonly max?: number;
  /** Faux tant que le panneau n'est pas visible : rien n'est demandé (TCK-1088). */
  readonly charger: boolean;
}

/**
 * Sans `QueryClientProvider` (un panneau monté seul, dans un test), rien n'est rendu ni demandé :
 * l'histogramme est un complément du budget, jamais une condition pour filtrer.
 */
export function HistogrammeDesPrix(props: HistogrammeDesPrixProps) {
  const client = useContext(QueryClientContext);
  if (!client || requeteDeRepartition(props.filters) === null) return null;
  return <Histogramme {...props} />;
}

function Histogramme({ filters, min, max, charger }: HistogrammeDesPrixProps) {
  const t = useTranslations('search.filters.histogramme');
  const tPeriodes = useTranslations('property.rentPeriods');
  const fmt = useFormatteurs();
  const requete = requeteDeRepartition(filters);

  const { data, isPending } = useQuery({
    queryKey: ['public', 'repartition-des-prix', requete],
    queryFn: () =>
      apiFetch<{ data: Repartition }>(`/public/properties/price-distribution?${requete}`).then((r) => r.data),
    enabled: charger && requete !== null,
    staleTime: 5 * 60_000,
  });

  const tranches = data?.buckets ?? [];
  const periode = filters.rent_period;
  const echelle =
    filters.contract_type === 'sale'
      ? t('prixDeVente')
      : !periode || periode === 'monthly'
        ? t('loyerMensuel')
        : t('loyerPeriode', { periode: tPeriodes(periode) });
  const moitie = borneDeLaMoitie(tranches);
  const plusHaute = Math.max(1, ...tranches.map((tr) => tr.count));
  const borne = min !== undefined || max !== undefined;

  return (
    <div data-histogramme className="mb-3">
      {/* La phrase dit CE QUI est compté — les loyers mensuels, pas « les biens » : l'histogramme d'une
          location sans période exclut les loyers à la semaine et au jour (TCK-2498), que la liste
          montre ; « la moitié des biens » se lisait comme les biens de la liste (revue de TCK-2499). */}
      <p className="text-sm text-muted-foreground">
        {moitie === null
          ? echelle
          : filters.contract_type === 'sale'
            ? t('moitiePrixDeVente', { montant: fmt.montant(moitie) })
            : !periode || periode === 'monthly'
              ? t('moitieLoyersMensuels', { montant: fmt.montant(moitie) })
              : t('moitieLoyersPeriode', { montant: fmt.montant(moitie), periode: tPeriodes(periode) })}
      </p>
      {/* Hauteur réservée pendant le chargement : la section ne saute pas à l'arrivée des barres. */}
      <div className="mt-2 flex h-16 items-end gap-[3px]" aria-hidden="true">
        {isPending && charger
          ? Array.from({ length: 12 }).map((_, i) => (
              <span key={i} className="h-1/3 flex-1 animate-pulse rounded-t-[2px] bg-muted" />
            ))
          : tranches.map((tr) => (
              <span
                key={tr.from}
                data-tranche={tr.from}
                data-dans-le-budget={dansLeBudget(tr, min, max) || undefined}
                style={{ height: `${Math.max(6, (tr.count / plusHaute) * 100)}%` }}
                className={cn(
                  'flex-1 rounded-t-[2px] transition-colors duration-150',
                  !borne ? 'bg-primary/45' : dansLeBudget(tr, min, max) ? 'bg-primary/70' : 'bg-border',
                )}
              />
            ))}
      </div>
    </div>
  );
}
