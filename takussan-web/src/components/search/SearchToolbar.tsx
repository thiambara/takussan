'use client';

import React from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import type { SearchFilters } from '@/types/search';

const SORT_OPTIONS = [
  { value: 'relevance',   label: 'Pertinence' },
  { value: 'price_asc',   label: 'Prix ↑' },
  { value: 'price_desc',  label: 'Prix ↓' },
  { value: 'created_desc',label: 'Plus récent' },
] as const;

const FILTER_LABELS: Partial<Record<keyof SearchFilters, (v: unknown) => string>> = {
  contract_type: (v) => v === 'sale' ? 'Vente' : 'Location',
  type: (v) => ({
    apartment: 'Appartement', house: 'Maison', villa: 'Villa',
    land: 'Terrain', studio: 'Studio', room: 'Chambre',
    office: 'Bureau', shop: 'Commerce', warehouse: 'Entrepôt',
    hotel: 'Hôtel', resort: 'Complexe', garage: 'Garage',
    parking: 'Parking', farm: 'Ferme', factory: 'Usine', other: 'Autre',
  }[v as string] ?? String(v)),
  rent_period: (v) => ({ daily: 'Journalier', weekly: 'Hebdo', monthly: 'Mensuel', yearly: 'Annuel' }[v as string] ?? String(v)),
  price_min: (v) => `≥ ${Number(v).toLocaleString('fr-SN')} FCFA`,
  price_max: (v) => `≤ ${Number(v).toLocaleString('fr-SN')} FCFA`,
  bedrooms:  (v) => `${v} ch.`,
  bathrooms: (v) => `${v} sdb`,
  area_min:  (v) => `≥ ${v} m²`,
  area_max:  (v) => `≤ ${v} m²`,
  furnished: (v) => v ? 'Meublé' : 'Non meublé',
  featured:  ()  => '★ En vedette',
  city:      (v) => String(v),
  location:  (v) => `Quartier: ${v}`,
  q:         (v) => `"${v}"`,
  tags:      (v) => `Tags: ${v}`,
};

const HIDDEN_FROM_TAGS: (keyof SearchFilters)[] = ['sort', 'page', 'per_page'];

export interface SearchToolbarProps {
  total: number;
  loading: boolean;
  filters: SearchFilters;
  activeCount: number;
  onRemoveFilter: (key: keyof SearchFilters) => void;
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
  const activeTags = (Object.keys(filters) as (keyof SearchFilters)[])
    .filter(k => !HIDDEN_FROM_TAGS.includes(k) && filters[k] !== undefined && filters[k] !== '');

  return (
    <div className="mb-6 space-y-3">
      {/* Top row : count + sort + mobile filter button */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-gray-700">
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full border-2 border-[#0050cb] border-t-transparent animate-spin" />
              Chargement…
            </span>
          ) : (
            <>{total.toLocaleString('fr-SN')} bien{total > 1 ? 's' : ''} trouvé{total > 1 ? 's' : ''}</>
          )}
        </p>

        <div className="flex items-center gap-3">
          {/* Per-page selector */}
          <select
            value={filters.per_page ?? 20}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-full px-3 py-1.5 text-gray-700 bg-white outline-none focus:ring-2 focus:ring-[#0050cb]/20 focus:border-[#0050cb] cursor-pointer transition-colors"
            aria-label="Résultats par page"
          >
            {[12, 20, 36, 60].map(n => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>

          {/* Sort selector */}
          <select
            value={filters.sort ?? 'relevance'}
            onChange={(e) => onSortChange(e.target.value as SearchFilters['sort'])}
            className="text-sm border border-gray-200 rounded-full px-3 py-1.5 text-gray-700 bg-white outline-none focus:ring-2 focus:ring-[#0050cb]/20 focus:border-[#0050cb] cursor-pointer transition-colors"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Filters button (mobile) */}
          <button
            onClick={onOpenSidebar}
            className="md:hidden relative flex items-center gap-2 text-sm font-semibold border border-gray-300 rounded-full px-4 py-1.5 hover:border-[#0050cb] hover:text-[#0050cb] transition-colors"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtres
            {activeCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#0050cb] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Active filter tags */}
      {activeTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activeTags.map(key => {
            const labelFn = FILTER_LABELS[key];
            const label = labelFn ? labelFn(filters[key]) : String(filters[key]);
            return (
              <button
                key={key}
                onClick={() => onRemoveFilter(key)}
                className="flex items-center gap-1.5 text-xs font-semibold bg-[#0050cb]/8 text-[#0050cb] border border-[#0050cb]/20 rounded-full px-3 py-1 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors group"
              >
                {label}
                <X className="w-3 h-3 opacity-60 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
