import Link from 'next/link';
import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatCardProps {
  /** Libellé court, rendu en eyebrow. Déjà traduit. */
  readonly label: ReactNode;
  readonly value: ReactNode;
  /** Précision sous la valeur : unité, dernière mesure, pilote… */
  readonly hint?: ReactNode;
  /** Variation période à période. `direction` porte le SENS, jamais le signe du nombre. */
  readonly delta?: { readonly label: ReactNode; readonly direction: 'up' | 'down' | 'flat' };
  /** Icône lucide en `size-4`, posée en haut à droite. */
  readonly icon?: ReactNode;
  /** Rend la tuile entière cliquable. */
  readonly href?: string;
  /** Remplace la valeur par un squelette — l'ossature de la tuile ne bouge pas. */
  readonly loading?: boolean;
  /**
   * Ton de la valeur. `danger` est le SEUL accent : une tuile qui colore tout perd le pouvoir de
   * signaler quoi que ce soit.
   */
  readonly tone?: 'default' | 'danger';
  readonly className?: string;
}

/**
 * La tuile de chiffre de la console.
 *
 * Elle remplace quatre blocs mesurés le 2026-08-26 — `Stat` (moderation), `QueueMetric` et
 * `HealthTile` (system-health), `Metric` et `AgencyHealthStrip` (agency-detail) — qui rendaient
 * tous « un libellé, un grand nombre » avec quatre typographies différentes.
 *
 * Purement présentationnel : aucun texte n'y est écrit, `delta.direction` porte le sens plutôt
 * qu'une flèche déduite du signe (une baisse d'impayés est une bonne nouvelle, et personne ne
 * peut le savoir depuis ce composant).
 */
export function StatCard({
  label,
  value,
  hint,
  delta,
  icon,
  href,
  loading = false,
  tone = 'default',
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p
          className={cn(
            'mt-2 font-display text-2xl font-semibold tabular-nums',
            tone === 'danger' ? 'text-destructive' : 'text-foreground',
          )}
        >
          {value}
        </p>
      )}
      {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
      {delta ? (
        <p
          className={cn(
            'mt-1 text-xs font-medium',
            delta.direction === 'up' && 'text-accent',
            delta.direction === 'down' && 'text-destructive',
            delta.direction === 'flat' && 'text-muted-foreground',
          )}
        >
          {delta.label}
        </p>
      ) : null}
    </>
  );

  const shell = cn(
    'block rounded-xl bg-card p-4 ring-1 ring-border',
    href && 'transition-colors hover:bg-muted/40',
    className,
  );

  return href ? (
    <Link href={href} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export type { StatCardProps };
