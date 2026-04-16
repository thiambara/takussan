'use client';

const SORT_OPTIONS = [
  { value: 'relevance',     label: '⭐ Pertinence' },
  { value: 'price_asc',    label: '↑ Prix croissant' },
  { value: 'price_desc',   label: '↓ Prix décroissant' },
  { value: 'created_desc', label: '🕐 Plus récents' },
] as const;

type SortValue = typeof SORT_OPTIONS[number]['value'];

interface Props {
  value?: string;
  onChange: (sort: SortValue) => void;
}

export function SortDropdown({ value, onChange }: Props) {
  return (
    <select
      value={value ?? 'relevance'}
      onChange={e => onChange(e.target.value as SortValue)}
      className="border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 transition-colors duration-150"
      aria-label="Trier les annonces"
    >
      {SORT_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
