'use client';

export type TypoKey = 'contemporain' | 'editorial' | 'humaniste';

interface TypoSpec {
  key: TypoKey;
  name: string;
  /** CSS var name to apply on the preview "Aa" so the switcher prévisualise la fonte. */
  displayVar: string;
}

const TYPOS: ReadonlyArray<TypoSpec> = [
  { key: 'contemporain', name: 'Contemporain', displayVar: 'var(--font-bricolage)' },
  { key: 'editorial',    name: 'Éditorial',    displayVar: 'var(--font-fraunces)'  },
  { key: 'humaniste',    name: 'Humaniste',    displayVar: 'var(--font-manrope)'   },
];

interface TypographySwitcherProps {
  readonly active: TypoKey;
  readonly onChange: (key: TypoKey) => void;
}

export function TypographySwitcher({ active, onChange }: TypographySwitcherProps) {
  return (
    <div
      className="flex items-center gap-1 rounded-full border border-[var(--pg-hairline)] bg-[var(--pg-cream)]/80 backdrop-blur-sm p-0.5"
      role="radiogroup"
      aria-label="Typographie"
    >
      {TYPOS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`Typographie ${t.name}`}
            title={t.name}
            onClick={() => onChange(t.key)}
            className={`px-3 h-7 rounded-full text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${
              isActive
                ? 'pg-typo-active'
                : 'text-[var(--pg-ink-muted)] hover:text-[var(--pg-ink)]'
            }`}
          >
            <span
              className="text-[14px] leading-none"
              style={{ fontFamily: t.displayVar, letterSpacing: '-0.02em' }}
            >
              Aa
            </span>
            <span className="hidden lg:inline">{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}
