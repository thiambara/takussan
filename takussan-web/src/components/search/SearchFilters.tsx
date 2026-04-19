'use client';
import type { SearchFilters } from '@/types/search';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const QUARTERS = [
  'Almadies', 'Mermoz', 'Sacré-Cœur', 'Plateau', 'Fann',
  'Ouakam', 'Yoff', 'Ngor', 'Point E', 'Liberté',
  'Grand Yoff', 'Biscuiterie', 'HLM', 'Sicap', 'Diamniadio',
];

const PRICE_RANGES = [
  { label: '< 200 000 FCFA',       min: undefined,  max: 200_000 },
  { label: '200 000 – 500 000',    min: 200_000,    max: 500_000 },
  { label: '500 000 – 1 000 000',  min: 500_000,    max: 1_000_000 },
  { label: '> 1 000 000 FCFA',     min: 1_000_000,  max: undefined },
] as const;

interface Props {
  filters: SearchFilters;
  onSearch: (f: SearchFilters) => void;
}

export function SearchFilters({ filters, onSearch }: Props) {
  function update(patch: Partial<SearchFilters>) {
    onSearch({ ...filters, ...patch, page: undefined });
  }

  function clearAll() {
    onSearch({});
  }

  const hasFilters = !!(filters.location || filters.price_min || filters.price_max || filters.bedrooms);

  return (
    <aside className="bg-white rounded-xl shadow-sm p-5 space-y-6 self-start sticky top-20">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-stone-900">Filtres</h2>
        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-sm text-slate-600 underline underline-offset-4 hover:text-slate-800 transition-colors duration-150"
          >
            Tout effacer
          </button>
        )}
      </div>

      {/* Quartier */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Quartier</label>
        <Select
          value={filters.location ?? 'all'}
          onValueChange={(v) => update({ location: !v || v === 'all' ? undefined : v })}
        >
          <SelectTrigger className="w-full rounded-lg text-sm h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les quartiers</SelectItem>
            {QUARTERS.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Budget */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Budget</label>
        <div className="space-y-2">
          {PRICE_RANGES.map(range => {
            const isActive = filters.price_min === range.min && filters.price_max === range.max;
            return (
              <label key={range.label} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="price_range"
                  checked={isActive}
                  onChange={() => update({ price_min: range.min, price_max: range.max })}
                  className="accent-slate-700"
                />
                {range.label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Chambres */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Chambres</label>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => update({ bedrooms: filters.bedrooms === n ? undefined : n })}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors duration-150 ${
                filters.bedrooms === n
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'border-stone-300 text-stone-700 hover:bg-stone-50'
              }`}
            >
              {n === 5 ? '5+' : n}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
