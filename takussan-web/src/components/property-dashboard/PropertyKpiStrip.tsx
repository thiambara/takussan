import Link from 'next/link';

import { cn } from '@/lib/utils';

interface KpiTile {
  readonly label: string;
  readonly value: number;
  readonly href: string;
  readonly tone?: 'neutral' | 'success' | 'accent' | 'muted';
  readonly active?: boolean;
}

/** Les tons ne valent que pour la tuile de `lg` : sous `lg`, la pastille est neutre ou pleine. */
const TONE_CLASSES: Record<NonNullable<KpiTile['tone']>, string> = {
  neutral: 'lg:bg-card lg:hover:bg-muted/70',
  success: 'lg:bg-success/10 lg:hover:bg-success/15',
  accent: 'lg:bg-primary/5 lg:hover:bg-primary/10',
  muted: 'lg:bg-muted/40 lg:hover:bg-muted/70',
};

/**
 * Les compteurs de « Mes biens » — chacun est un LIEN qui filtre la liste.
 *
 * TCK-644 — sous `lg`, une rangée de pastilles « libellé · nombre » qui défile de bord à bord dans
 * son conteneur (`-mx-4`, la marge de la coque) : la grille 2×2 de grandes tuiles prenait la
 * moitié du premier écran à 390 px, et la première carte de bien tombait sous le pli. Le compteur
 * actif est une pastille PLEINE (encre), en plus d'`aria-current` : l'état ne repose pas sur une
 * nuance de fond. Dès `lg`, la grille de quatre tuiles d'origine revient, à l'identique.
 */
export function PropertyKpiStrip({
  tiles,
  label,
}: {
  readonly tiles: readonly KpiTile[];
  /** Nom du repère de navigation (les pastilles filtrent la liste). */
  readonly label?: string;
}) {
  return (
    <nav
      aria-label={label}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:-mx-6 md:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-3 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {tiles.map((tile) => {
        const actif = tile.active === true;
        // Sous `lg` : pastille pleine si active, sinon carte claire cerclée. Dès `lg` : la tuile.
        const pastille = actif
          ? 'bg-foreground text-background lg:text-foreground'
          : 'bg-card text-foreground ring-1 ring-inset ring-border hover:bg-muted/70 lg:ring-0';
        return (
          <Link
            key={tile.label}
            href={tile.href}
            aria-current={actif ? 'true' : undefined}
            className={cn(
              'group flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50',
              'lg:min-h-0 lg:flex-col lg:items-start lg:gap-1 lg:rounded-xl lg:px-4 lg:py-4',
              pastille,
              TONE_CLASSES[tile.tone ?? 'neutral'],
              actif && 'lg:ring-1 lg:ring-inset lg:ring-primary/30',
            )}
          >
            <span
              className={cn(
                'whitespace-nowrap text-sm font-medium lg:text-xs lg:uppercase lg:tracking-wide lg:text-muted-foreground',
                actif ? 'text-background/80' : 'text-muted-foreground',
              )}
            >
              {tile.label}
            </span>
            <span className="text-sm font-semibold tabular-nums lg:text-2xl lg:font-bold lg:text-foreground">
              {tile.value.toLocaleString('fr-FR')}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
