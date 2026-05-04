'use client';

export type PaletteKey =
  | 'sahel'
  | 'lin'
  | 'coton'
  | 'calcaire'
  | 'cotier'
  | 'casamance'
  | 'saly';

export const PALETTES: ReadonlyArray<{
  key: PaletteKey;
  name: string;
  accent: string;
  accent2: string;
  /** Indication visuelle "fond clair" pour aider l'utilisateur à choisir. */
  light?: boolean;
}> = [
  { key: 'sahel',     name: 'Sahel',     accent: '#c2562c', accent2: '#3d5a47' },
  { key: 'lin',       name: 'Lin',       accent: '#a85332', accent2: '#5d6e4f', light: true },
  { key: 'coton',     name: 'Coton',     accent: '#c2562c', accent2: '#1f5d6e', light: true },
  { key: 'calcaire',  name: 'Calcaire',  accent: '#8a4a2b', accent2: '#5a6b62', light: true },
  { key: 'cotier',    name: 'Côtier',    accent: '#c64f3c', accent2: '#1d6273' },
  { key: 'casamance', name: 'Casamance', accent: '#a04a32', accent2: '#4a6448' },
  { key: 'saly',      name: 'Saly',      accent: '#e36b40', accent2: '#c43e6b' },
];

interface PaletteSwitcherProps {
  readonly active: PaletteKey;
  readonly onChange: (key: PaletteKey) => void;
}

export function PaletteSwitcher({ active, onChange }: PaletteSwitcherProps) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Palette de couleurs">
      {PALETTES.map((p) => {
        const isActive = p.key === active;
        const titleSuffix = p.light ? ' (fond clair)' : '';
        return (
          <button
            key={p.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`Palette ${p.name}${titleSuffix}`}
            title={`${p.name}${titleSuffix}`}
            onClick={() => onChange(p.key)}
            className={`relative size-7 rounded-full transition-transform hover:scale-110 ${
              isActive ? 'pg-swatch-active pg-swatch-ripple' : ''
            }`}
            style={{
              background: `linear-gradient(135deg, ${p.accent} 0%, ${p.accent} 50%, ${p.accent2} 50%, ${p.accent2} 100%)`,
            }}
          >
            {p.light && (
              <span
                className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-white border border-[var(--pg-hairline)]"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
