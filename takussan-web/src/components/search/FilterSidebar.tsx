'use client';

import React, { useCallback } from 'react';
import { X, RotateCcw, Search, Star, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SearchFilters } from '@/types/search';

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-5 border-b border-gray-100 last:border-0">
      <h3 className="text-sm font-bold text-gray-800 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const isActive = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(isActive ? undefined : opt.value)}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-all duration-150 ${
              isActive
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-gray-200 text-gray-600 hover:border-primary hover:text-primary'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function RangeInputs({
  placeholderMin,
  placeholderMax,
  valueMin,
  valueMax,
  hint,
  onChange,
}: {
  placeholderMin: string;
  placeholderMax: string;
  valueMin: number | undefined;
  valueMax: number | undefined;
  hint?: string;
  onChange: (min: number | undefined, max: number | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder={placeholderMin}
          value={valueMin ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined, valueMax)}
          className="rounded-xl"
        />
        <span className="shrink-0 text-gray-400 text-sm">–</span>
        <Input
          type="number"
          placeholder={placeholderMax}
          value={valueMax ?? ''}
          onChange={(e) => onChange(valueMin, e.target.value ? Number(e.target.value) : undefined)}
          className="rounded-xl"
        />
      </div>
      {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

// ─── Data ────────────────────────────────────────────────────────────────────

const CONTRACT_TYPES = [
  { label: 'Vente',    value: 'sale' as const },
  { label: 'Location', value: 'rent' as const },
];

const PROPERTY_TYPES = [
  { label: 'Appartement', value: 'apartment' },
  { label: 'Maison',      value: 'house' },
  { label: 'Villa',       value: 'villa' },
  { label: 'Studio',      value: 'studio' },
  { label: 'Chambre',     value: 'room' },
  { label: 'Terrain',     value: 'land' },
  { label: 'Bureau',      value: 'office' },
  { label: 'Commerce',    value: 'shop' },
  { label: 'Entrepôt',    value: 'warehouse' },
  { label: 'Hôtel',       value: 'hotel' },
  { label: 'Complexe',    value: 'resort' },
  { label: 'Garage',      value: 'garage' },
  { label: 'Parking',     value: 'parking' },
  { label: 'Ferme',       value: 'farm' },
  { label: 'Usine',       value: 'factory' },
  { label: 'Autre',       value: 'other' },
];

const RENT_PERIODS = [
  { label: 'Journalier', value: 'daily' as const },
  { label: 'Hebdo',      value: 'weekly' as const },
  { label: 'Mensuel',    value: 'monthly' as const },
  { label: 'Annuel',     value: 'yearly' as const },
];

const BEDROOM_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 5 },
];

const BATHROOM_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3+', value: 3 },
];

const FLOOR_OPTIONS = [
  { label: 'RDC', value: 0 },
  { label: '1er', value: 1 },
  { label: '2e', value: 2 },
  { label: '3e', value: 3 },
  { label: '4e+', value: 4 },
];

// ─── Main component ───────────────────────────────────────────────────────────

export interface FilterSidebarProps {
  filters: SearchFilters;
  onFilterChange: (patch: Partial<SearchFilters>) => void;
  onReset: () => void;
  activeCount: number;
  open: boolean;
  onClose: () => void;
}

export function FilterSidebar({
  filters,
  onFilterChange,
  onReset,
  activeCount,
  open,
  onClose,
}: FilterSidebarProps) {
  const set = useCallback(
    (patch: Partial<SearchFilters>) => onFilterChange({ ...patch, page: 1 }),
    [onFilterChange]
  );

  const priceHint = (() => {
    const parts = [];
    if (filters.price_min !== undefined) parts.push(`≥ ${filters.price_min.toLocaleString('fr-SN')} FCFA`);
    if (filters.price_max !== undefined) parts.push(`≤ ${filters.price_max.toLocaleString('fr-SN')} FCFA`);
    return parts.join(' · ');
  })();

  const content = (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900 flex items-center">
          Filtres
          {activeCount > 0 && (
            <Badge className="ml-2">{activeCount}</Badge>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tout effacer
            </button>
          )}
          <button
            onClick={onClose}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
            aria-label="Fermer les filtres"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-5">

        {/* 1. Transaction */}
        <Section title="Type de transaction">
          <ChipGroup
            options={CONTRACT_TYPES}
            value={filters.contract_type}
            onChange={(v) => set({ contract_type: v as SearchFilters['contract_type'], rent_period: undefined })}
          />
        </Section>

        {/* 2. Property type — multi-select */}
        <Section title="Type de bien">
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPES.map(opt => {
              const selected = filters.type ?? [];
              const isActive = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    const next = isActive
                      ? selected.filter(t => t !== opt.value)
                      : [...selected, opt.value];
                    set({ type: next.length > 0 ? next : undefined });
                  }}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all duration-150 ${
                    isActive
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-gray-200 text-gray-600 hover:border-primary hover:text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </Section>

        {/* 3. Rent period — conditional */}
        {filters.contract_type === 'rent' && (
          <Section title="Fréquence de loyer">
            <ChipGroup
              options={RENT_PERIODS}
              value={filters.rent_period}
              onChange={(v) => set({ rent_period: v as SearchFilters['rent_period'] })}
            />
          </Section>
        )}

        {/* 4. Location */}
        <Section title="Localisation">
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="Ville (ex : Dakar, Mbour…)"
              value={filters.city ?? ''}
              onChange={(e) => set({ city: e.target.value || undefined })}
              className="rounded-xl"
            />
            <Input
              type="text"
              placeholder="Quartier (ex : Plateau, Almadies…)"
              value={filters.location ?? ''}
              onChange={(e) => set({ location: e.target.value || undefined })}
              className="rounded-xl"
            />
          </div>
        </Section>

        {/* 5. Budget */}
        <Section title="Budget (FCFA)">
          <RangeInputs
            placeholderMin="Min"
            placeholderMax="Max"
            valueMin={filters.price_min}
            valueMax={filters.price_max}
            hint={priceHint || undefined}
            onChange={(min, max) => set({ price_min: min, price_max: max })}
          />
        </Section>

        {/* 6. Chambres */}
        <Section title="Chambres">
          <ChipGroup
            options={BEDROOM_OPTIONS}
            value={filters.bedrooms}
            onChange={(v) => set({ bedrooms: v as number })}
          />
        </Section>

        {/* 7. Salles de bain */}
        <Section title="Salles de bain">
          <ChipGroup
            options={BATHROOM_OPTIONS}
            value={filters.bathrooms}
            onChange={(v) => set({ bathrooms: v as number })}
          />
        </Section>

        {/* 8. Surface */}
        <Section title="Surface (m²)">
          <RangeInputs
            placeholderMin="Min m²"
            placeholderMax="Max m²"
            valueMin={filters.area_min}
            valueMax={filters.area_max}
            onChange={(min, max) => set({ area_min: min, area_max: max })}
          />
        </Section>

        {/* 9. État */}
        <Section title="État du bien">
          <div className="space-y-2">
            <button
              onClick={() => set({ furnished: filters.furnished === true ? undefined : true })}
              className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all duration-150 ${
                filters.furnished === true
                  ? 'bg-primary/5 border-primary text-primary'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span
                className={`relative shrink-0 w-10 h-5 rounded-full transition-colors duration-200 ${
                  filters.furnished === true ? 'bg-primary' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                    filters.furnished === true ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </span>
              <span className="text-sm font-semibold">Meublé uniquement</span>
            </button>

            <button
              onClick={() => set({ featured: filters.featured === true ? undefined : true })}
              className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all duration-150 ${
                filters.featured === true
                  ? 'bg-amber-50 border-amber-400 text-amber-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <Star
                className={`w-4 h-4 shrink-0 ${
                  filters.featured === true ? 'fill-amber-400 text-amber-400' : 'text-gray-400'
                }`}
              />
              <span className="text-sm font-semibold">Biens en vedette</span>
            </button>
          </div>
        </Section>

        {/* 10. Étage */}
        <Section title="Étage">
          <ChipGroup
            options={FLOOR_OPTIONS}
            value={filters.floor_number}
            onChange={(v) => set({ floor_number: v as number })}
          />
        </Section>

        {/* 11. Disponibilité */}
        <Section title="Disponibilité">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Disponible dès le…</label>
            <input
              type="date"
              value={filters.available_from ?? ''}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => set({ available_from: e.target.value || undefined })}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
            />
          </div>
        </Section>

        {/* 12. Tags */}
        <Section title="Équipements">
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="piscine, parking, terrasse…"
              value={filters.tags ?? ''}
              onChange={(e) => set({ tags: e.target.value || undefined })}
              className="rounded-xl pl-9"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">Séparez par des virgules</p>
        </Section>

        {/* 13. Full-text search */}
        <Section title="Recherche avancée">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="Mot-clé, référence, description…"
              value={filters.q ?? ''}
              onChange={(e) => set({ q: e.target.value || undefined })}
              className="rounded-xl pl-9"
            />
          </div>
        </Section>

      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-[264px] shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm self-start sticky top-[145px]">
        {content}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <div className="relative bg-white rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex-1 overflow-y-auto">
              {content}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 bg-white shrink-0">
              <Button
                onClick={onClose}
                className="w-full rounded-full h-12 text-sm font-semibold"
              >
                Voir les résultats
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
