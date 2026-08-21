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
import type { SearchFilters } from '@/types/search';

const SORT_VALUES = ['relevance', 'price_asc', 'price_desc', 'created_desc'] as const;

type Traducteur = (cle: string, valeurs?: Record<string, string | number>) => string;

/**
 * Fabrique les étiquettes de filtre actif.
 *
 * C'était une table de module, donc un endroit où `useTranslations` n'est pas appelable — le
 * patron du dépôt (TCK-286) veut que la donnée porte une CLÉ et que le rendu la résolve. Ici la
 * « donnée » est une fonction par filtre : la fabrique reçoit donc les traducteurs et rend la
 * même table, construite dans le composant.
 */
function fabriqueEtiquettes(
  t: Traducteur,
  tTypes: Traducteur,
  tContract: Traducteur,
  tPeriods: Traducteur,
): Partial<Record<keyof SearchFilters, (v: unknown) => string>> {
  return {
    contract_type: (v) => tContract(v === 'sale' ? 'sale' : 'rent'),
    type: (v) => tTypes(String(v)),
    rent_period: (v) => tPeriods(String(v)),
    price_min: (v) => t('tags.priceMin', { value: Number(v).toLocaleString('fr-SN') }),
    price_max: (v) => t('tags.priceMax', { value: Number(v).toLocaleString('fr-SN') }),
    bedrooms: (v) => t('tags.bedrooms', { n: String(v) }),
    bathrooms: (v) => t('tags.bathrooms', { n: String(v) }),
    area_min: (v) => t('tags.areaMin', { value: String(v) }),
    area_max: (v) => t('tags.areaMax', { value: String(v) }),
    furnished: (v) => t(v ? 'tags.furnished' : 'tags.notFurnished'),
    featured: () => t('tags.featured'),
    floor_number: (v) =>
      Number(v) === 0 ? t('tags.groundFloor') : t('tags.floor', { n: String(v) }),
    available_from: (v) =>
      t('tags.availableFrom', {
        date: new Date(String(v)).toLocaleDateString('fr-SN', {
          day: '2-digit', month: 'short', year: 'numeric',
        }),
      }),
    city: (v) => String(v),
    location: (v) => t('tags.quarter', { value: String(v) }),
    q: (v) => `"${v}"`,
    tags: (v) => t('tags.tags', { value: String(v) }),
  };
}

const HIDDEN_FROM_TAGS: (keyof SearchFilters)[] = ['sort', 'page', 'per_page'];

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
  const tTags = useTranslations('search');
  const tTypes = useTranslations('property.types');
  const tContract = useTranslations('property.contractTypes');
  const tPeriods = useTranslations('property.rentPeriods');
  const tSort = useTranslations('search.sort');

  const FILTER_LABELS = fabriqueEtiquettes(tTags, tTypes, tContract, tPeriods);
  const perPageOptions = [30, 40, 60, 70].map((n) => ({
    value: String(n),
    label: t('perPageOption', { count: n }),
  }));
  const sortOptions = SORT_VALUES.map((v) => ({ value: v, label: tSort(v) }));

  const activeTags: { key: keyof SearchFilters; subKey?: string; label: string }[] = [];
  (Object.keys(filters) as (keyof SearchFilters)[]).forEach(key => {
    if (HIDDEN_FROM_TAGS.includes(key)) return;
    const value = filters[key];
    if (value === undefined || value === '') return;
    if (key === 'type' && Array.isArray(value)) {
      const labelFn = FILTER_LABELS['type']!;
      value.forEach(v => activeTags.push({ key: 'type', subKey: v, label: labelFn(v) }));
    } else {
      const labelFn = FILTER_LABELS[key];
      activeTags.push({ key, label: labelFn ? labelFn(value) : String(value) });
    }
  });

  return (
    <div className="mb-6 space-y-3">
      {/* Top row : count + sort + mobile filter button */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-gray-700">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              {t('loading')}
            </span>
          ) : total === null ? null : (
            t('resultCount', { count: total })
          )}
        </p>

        <div className="flex items-center gap-3">
          {/* Per-page selector */}
          <Select
            value={String(filters.per_page ?? 30)}
            onValueChange={(v) => onPerPageChange(Number(v))}
            items={perPageOptions}
          >
            <SelectTrigger
              className="h-auto rounded-full py-1.5 px-3 border-gray-200 bg-white text-gray-700 cursor-pointer"
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
            <SelectTrigger className="h-auto rounded-full py-1.5 px-3 border-gray-200 bg-white text-gray-700 cursor-pointer">
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
            className="md:hidden relative flex items-center gap-2 text-sm font-semibold border border-gray-300 rounded-full px-4 py-1.5 hover:border-primary hover:text-primary transition-colors"
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
          {activeTags.map(({ key, subKey, label }) => (
            <button
              key={subKey ? `${key}-${subKey}` : key}
              onClick={() => onRemoveFilter(key, subKey)}
              className="flex items-center gap-1.5 text-xs font-semibold bg-primary/8 text-primary border border-primary/20 rounded-full px-3 py-1 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors group"
            >
              {label}
              <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
