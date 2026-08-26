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
  neutral: 'bg-card hover:bg-muted/70',
  success: 'bg-emerald-50/60 hover:bg-emerald-100/60',
  accent: 'bg-primary/5 hover:bg-primary/10',
  muted: 'bg-muted/40 hover:bg-muted/70',
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
            tile.active && 'ring-1 ring-inset ring-primary/30',
          )}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tile.label}
          </span>
          <span className="text-2xl font-bold tabular-nums text-foreground">
            {tile.value.toLocaleString('fr-FR')}
          </span>
        </Link>
      ))}
    </div>
  );
}
