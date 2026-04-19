'use client';

import React, { useState, useCallback } from 'react';
import { X, RotateCcw, Search, Star, Tag } from 'lucide-react';
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
  multi = false,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T | T[] | undefined;
  multi?: boolean;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const isActive = multi
          ? Array.isArray(value) && value.includes(opt.value)
          : value === opt.value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(isActive ? undefined : opt.value)}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-all duration-150 ${
              isActive
                ? 'bg-[#0050cb] border-[#0050cb] text-white'
                : 'border-gray-200 text-gray-600 hover:border-[#0050cb] hover:text-[#0050cb]'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PriceSlider({
  min, max, valueMin, valueMax,
  onChange,
}: {
  min: number; max: number;
  valueMin: number | undefined; valueMax: number | undefined;
  onChange: (min: number | undefined, max: number | undefined) => void;
}) {
  const fmt = (v: number) => v.toLocaleString('fr-SN');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <input
            type="number"
            placeholder="Min"
            value={valueMin ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined, valueMax)}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/10 transition"
          />
        </div>
        <span className="text-gray-400 text-sm">–</span>
        <div className="flex-1 relative">
          <input
            type="number"
            placeholder="Max"
            value={valueMax ?? ''}
            onChange={(e) => onChange(valueMin, e.target.value ? Number(e.target.value) : undefined)}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/10 transition"
          />
        </div>
      </div>
      <p className="text-[11px] text-gray-400">
        {valueMin !== undefined && `Min : ${fmt(valueMin)} FCFA`}
        {valueMin !== undefined && valueMax !== undefined && ' · '}
        {valueMax !== undefined && `Max : ${fmt(valueMax)} FCFA`}
      </p>
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

// ─── Main component ───────────────────────────────────────────────────────────

export interface FilterSidebarProps {
  filters: SearchFilters;
  onFilterChange: (patch: Partial<SearchFilters>) => void;
  onReset: () => void;
  activeCount: number;
  // Mobile drawer
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

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900">
          Filtres
          {activeCount > 0 && (
            <span className="ml-2 bg-[#0050cb] text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {activeCount}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#0050cb] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Tout effacer
            </button>
          )}
          {/* Close button: visible only on mobile */}
          <button
            onClick={onClose}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-500"
            aria-label="Fermer les filtres"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-5">

        {/* Full-text search */}
        <Section title="Rechercher">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Mot-clé, référence, description…"
              value={filters.q ?? ''}
              onChange={(e) => set({ q: e.target.value || undefined })}
              className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2 outline-none focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/10 transition"
            />
          </div>
        </Section>

        {/* Transaction */}
        <Section title="Type de transaction">
          <ChipGroup
            options={CONTRACT_TYPES}
            value={filters.contract_type}
            onChange={(v) => set({ contract_type: v as SearchFilters['contract_type'], rent_period: undefined })}
          />
        </Section>

        {/* Property type */}
        <Section title="Type de bien">
          <div className="flex flex-wrap gap-2">
            {PROPERTY_TYPES.map(opt => (
              <button
                key={opt.value}
                onClick={() => set({ type: filters.type === opt.value ? undefined : opt.value })}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all duration-150 ${
                  filters.type === opt.value
                    ? 'bg-[#0050cb] border-[#0050cb] text-white'
                    : 'border-gray-200 text-gray-600 hover:border-[#0050cb] hover:text-[#0050cb]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Rent period — only shown when contract_type=rent */}
        {filters.contract_type === 'rent' && (
          <Section title="Fréquence de loyer">
            <ChipGroup
              options={RENT_PERIODS}
              value={filters.rent_period}
              onChange={(v) => set({ rent_period: v as SearchFilters['rent_period'] })}
            />
          </Section>
        )}

        {/* Price */}
        <Section title="Budget (FCFA)">
          <PriceSlider
            min={0}
            max={2_000_000_000}
            valueMin={filters.price_min}
            valueMax={filters.price_max}
            onChange={(min, max) => set({ price_min: min, price_max: max })}
          />
        </Section>

        {/* Bedrooms */}
        <Section title="Chambres">
          <ChipGroup
            options={BEDROOM_OPTIONS}
            value={filters.bedrooms}
            onChange={(v) => set({ bedrooms: v as number })}
          />
        </Section>

        {/* Bathrooms */}
        <Section title="Salles de bain">
          <ChipGroup
            options={BATHROOM_OPTIONS}
            value={filters.bathrooms}
            onChange={(v) => set({ bathrooms: v as number })}
          />
        </Section>

        {/* Surface */}
        <Section title="Surface (m²)">
          <div className="flex items-center gap-3">
            <input
              type="number"
              placeholder="Min"
              value={filters.area_min ?? ''}
              onChange={(e) => set({ area_min: e.target.value ? Number(e.target.value) : undefined })}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/10 transition"
            />
            <span className="text-gray-400 text-sm">–</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.area_max ?? ''}
              onChange={(e) => set({ area_max: e.target.value ? Number(e.target.value) : undefined })}
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/10 transition"
            />
          </div>
        </Section>

        {/* Localisation */}
        <Section title="Localisation">
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Ville (ex: Dakar, Mbour…)"
              value={filters.city ?? ''}
              onChange={(e) => set({ city: e.target.value || undefined })}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/10 transition"
            />
            <input
              type="text"
              placeholder="Quartier (ex: Plateau, Almadies…)"
              value={filters.location ?? ''}
              onChange={(e) => set({ location: e.target.value || undefined })}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/10 transition"
            />
          </div>
        </Section>

        {/* Tags */}
        <Section title="Mots-clés / Équipements">
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="ex: piscine, parking, terrasse…"
              value={filters.tags ?? ''}
              onChange={(e) => set({ tags: e.target.value || undefined })}
              className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-3 py-2 outline-none focus:border-[#0050cb] focus:ring-2 focus:ring-[#0050cb]/10 transition"
            />
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">Séparez les tags par des virgules</p>
        </Section>

        {/* État du bien */}
        <Section title="État du bien">
          <div className="space-y-2">
            {/* Furnished */}
            <button
              onClick={() => set({ furnished: filters.furnished === true ? undefined : true })}
              className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border transition-all duration-150 ${
                filters.furnished === true
                  ? 'bg-[#0050cb]/5 border-[#0050cb] text-[#0050cb]'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
                  filters.furnished === true ? 'bg-[#0050cb]' : 'bg-gray-200'
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

            {/* Featured */}
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
      </div>
    </div>
  );

  // Desktop: static sidebar
  // Mobile: bottom sheet with overlay
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[264px] shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm self-start sticky top-[145px] max-h-[calc(100vh-160px)] overflow-hidden">
        {content}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Sheet */}
          <div className="relative bg-white rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            {content}
            <div className="px-5 py-4 border-t border-gray-100 bg-white">
              <button
                onClick={onClose}
                className="w-full bg-[#0050cb] text-white font-semibold py-3 rounded-full text-sm hover:bg-[#0043a8] transition-colors active:scale-[0.98]"
              >
                Voir les résultats
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
