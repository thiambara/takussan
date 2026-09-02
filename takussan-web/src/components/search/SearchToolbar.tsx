'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal, X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  puceDeChaqueFiltreActif,
  type SearchFilters,
  type TraducteursDeFiltre,
} from '@/types/search';

const SORT_VALUES = ['relevance', 'price_asc', 'price_desc', 'created_desc'] as const;

/**
 * TCK-346 — `distance` n'est proposé QUE lorsqu'une origine existe.
 *
 * Le serveur rend 422 sur `sort=distance` sans `lat`/`lng`
 * (`SearchPublicPropertyRequest::rules()`), et il a raison : sans origine, le tri n'a pas de
 * sens. Le refuser en 422 vaut mieux qu'un repli silencieux sur le tri par défaut — mais une
 * option qui produit un 422 à coup sûr n'a rien à faire dans une liste déroulante. Elle
 * apparaît donc avec le point et disparaît avec lui.
 */
const TRI_DISTANCE = 'distance' as const;

/**
 * TCK-340 — la table des libellés et la liste des clés masquées vivaient ICI, en double de
 * `useSearch.ts`, et le lien entre les deux n'était pas vérifiable.
 *
 * Elles sont maintenant dans `SEARCH_FILTER_KEYS` (`types/search.ts`) : une clé de rôle
 * `'filtre'` DOIT porter un libellé, sous peine d'erreur de compilation. Ce qui reste ici est
 * le rendu — et rien d'autre.
 *
 * Ce que le déplacement supprime au passage : `FILTER_LABELS['type']!`, une assertion NON NULLE
 * sur une table `Partial<…>`. Retirer l'entrée `type` de cette table faisait **planter la page**
 * (`TypeError: labelFn is not a function`) — mesuré par ablation le 2026-08-21 — pendant que
 * `tsc --noEmit` sortait en 0. L'objectif du ticket parlait d'une « puce muette » : il n'y en
 * avait pas. Pour seize clés sur dix-sept, un libellé manquant rendait la valeur BRUTE
 * (`furnished: true` → puce « true ») ; pour la dix-septième, il cassait l'écran.
 */

export interface SearchToolbarProps {
  /**
   * TCK-335 — `null` quand la recherche a ÉCHOUÉ : le compteur n'affiche alors rien.
   *
   * Il valait `meta?.total ?? 0`, si bien qu'un 422 sur un filtre affichait
   * « 0 biens trouvés » — une réponse, là où il n'y avait pas de réponse. Accompagner
   * ce zéro d'un bandeau d'erreur ne suffit pas : l'écran porterait alors deux
   * affirmations contradictoires, et c'est le chiffre que l'œil lit en premier.
   */
  total: number | null;
  loading: boolean;
  filters: SearchFilters;
  activeCount: number;
  onRemoveFilter: (key: keyof SearchFilters, subKey?: string) => void;
  onSortChange: (sort: SearchFilters['sort']) => void;
  onPerPageChange: (perPage: number) => void;
  onOpenSidebar: () => void;
}

export function SearchToolbar({
  total,
  loading,
  filters,
  activeCount,
  onRemoveFilter,
  onSortChange,
  onPerPageChange,
  onOpenSidebar,
}: SearchToolbarProps) {
  const t = useTranslations('search.toolbar');
  const tSort = useTranslations('search.sort');
  const trads: TraducteursDeFiltre = {
    tags: useTranslations('search'),
    types: useTranslations('property.types'),
    contract: useTranslations('property.contractTypes'),
    periods: useTranslations('property.rentPeriods'),
    titleTypes: useTranslations('property.titleTypes'),
  };

  const perPageOptions = [30, 40, 60, 70].map((n) => ({
    value: String(n),
    label: t('perPageOption', { count: n }),
  }));
  const aUnPointGeo = filters.lat !== undefined && filters.lng !== undefined;
  const valeursDeTri = aUnPointGeo ? [...SORT_VALUES, TRI_DISTANCE] : [...SORT_VALUES];
  const sortOptions = valeursDeTri.map((v) => ({ value: v, label: tSort(v) }));

  const activeTags = puceDeChaqueFiltreActif(filters, trads);

  return (
    <div className="mb-6 space-y-3">
      {/* Top row : count + sort + mobile filter button */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="shrink-0 whitespace-nowrap text-sm font-semibold text-foreground">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              {t('loading')}
            </span>
          ) : total === null ? null : (
            t('resultCount', { count: total })
          )}
        </p>

        {/* TCK-505 (#8, second relevé) — `flex-wrap` ici aussi : à 360 px, les deux sélecteurs et
            « Filtres » font 336 px dans 328 px disponibles et élargissaient le viewport à 368. */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Per-page selector */}
          <Select
            value={String(filters.per_page ?? 30)}
            onValueChange={(v) => onPerPageChange(Number(v))}
            items={perPageOptions}
          >
            <SelectTrigger
              className="h-auto rounded-full py-1.5 px-3 border-border bg-card text-foreground cursor-pointer"
              aria-label={t('perPageAria')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {perPageOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort selector */}
          <Select
            value={filters.sort ?? 'relevance'}
            onValueChange={(v) => onSortChange(v as SearchFilters['sort'])}
            items={sortOptions}
          >
            <SelectTrigger className="h-auto rounded-full py-1.5 px-3 border-border bg-card text-foreground cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filters button (mobile) */}
          <button
            onClick={onOpenSidebar}
            className="md:hidden relative flex items-center gap-2 text-sm font-semibold border border-border rounded-full px-4 py-1.5 hover:border-primary hover:text-primary transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {t('filters')}
            {activeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Active filter tags */}
      {activeTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeTags.map(({ cle, sousCle, libelle }) => (
            <button
              key={sousCle ? `${cle}-${sousCle}` : cle}
              onClick={() => onRemoveFilter(cle, sousCle)}
              className="flex items-center gap-1.5 text-xs font-semibold bg-primary/8 text-primary border border-primary/20 rounded-full px-3 py-1 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors group"
            >
              {libelle}
              <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
