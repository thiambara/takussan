import Link from 'next/link';

import { cn } from '@/lib/utils';

interface KpiTile {
  readonly label: string;
  readonly value: number;
  readonly href: string;
  readonly tone?: 'neutral' | 'success' | 'accent' | 'muted';
  readonly active?: boolean;
}

const TONE_CLASSES: Record<NonNullable<KpiTile['tone']>, string> = {
  neutral: 'bg-app-surface-1 hover:bg-app-surface-2/70',
  success: 'bg-emerald-50/60 hover:bg-emerald-100/60',
  accent: 'bg-app-accent/5 hover:bg-app-accent/10',
  muted: 'bg-app-surface-2/40 hover:bg-app-surface-2/70',
};

export function PropertyKpiStrip({ tiles }: { readonly tiles: readonly KpiTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((tile) => (
        <Link
          key={tile.label}
          href={tile.href}
          className={cn(
            'group flex flex-col gap-1 rounded-xl px-4 py-4 transition-colors',
            TONE_CLASSES[tile.tone ?? 'neutral'],
            tile.active && 'ring-1 ring-inset ring-app-accent/30',
          )}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-app-ink-muted">
            {tile.label}
          </span>
          <span className="text-2xl font-bold tabular-nums text-app-ink">
            {tile.value.toLocaleString('fr-FR')}
          </span>
        </Link>
      ))}
    </div>
  );
}
