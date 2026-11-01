'use client';

import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  /** Les contrôles de filtre. Disposés en grille responsive par défaut. */
  readonly children: ReactNode;
  /** Compteur de résultats, déjà traduit et déjà formaté (« 128 biens »). */
  readonly resultCount?: ReactNode;
  /**
   * L'action « réinitialiser ». `onReset` et `resetLabel` vont ENSEMBLE, comme `onRetry` et
   * `retryLabel` d'`ErrorState` : un bouton sans libellé serait un carré vide, un libellé sans
   * action un mensonge.
   */
  readonly onReset?: () => void;
  readonly resetLabel?: string;
  /** Désactive « réinitialiser » quand aucun filtre n'est posé. */
  readonly resetDisabled?: boolean;
  readonly className?: string;
  /** Classes de la grille des contrôles — c'est ici qu'un écran choisit son nombre de colonnes. */
  readonly controlsClassName?: string;
  /** Même passe-plat que celui de `DataState` : la barre reste désignable par un test. */
  readonly 'data-testid'?: string;
}

/**
 * Le conteneur de filtres de la console.
 *
 * Il ne connaît aucun filtre : il pose le cadre, le compteur de résultats et la remise à zéro, et
 * laisse chaque écran composer ses `<Select>` et ses `<Input>`. C'est délibéré — les six écrans
 * filtrés de la console n'ont pas deux fois le même jeu de critères, et une barre qui les
 * connaîtrait tous serait à modifier à chaque filtre ajouté.
 */
export function FilterBar({
  children,
  resultCount,
  onReset,
  resetLabel,
  resetDisabled = false,
  className,
  controlsClassName,
  'data-testid': dataTestId,
}: FilterBarProps) {
  return (
    <section
      className={cn('flex flex-col gap-3 rounded-xl bg-card p-3 ring-1 ring-border lg:flex-row lg:items-center lg:justify-between', className)}
      data-testid={dataTestId}
    >
      {/* `lg` et non `md` : dans la coque, `md` ne laisse que 464 px au contenu (TCK-505). */}
      <div className={cn('grid min-w-0 flex-1 gap-2 lg:grid-cols-3 xl:grid-cols-4', controlsClassName)}>
        {children}
      </div>
      {/*
        `resultCount != null` et non `resultCount` : un compteur passé en NOMBRE vaut `0` quand la
        recherche ne rend rien, et c'est exactement le moment où l'écran doit l'afficher. Un test
        de vérité l'aurait fait disparaître là.
      */}
      {resultCount != null || (onReset && resetLabel) ? (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 lg:justify-end">
          <p className="text-xs text-muted-foreground tabular-nums">{resultCount}</p>
          {onReset && resetLabel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onReset} disabled={resetDisabled}>
              {resetLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export type { FilterBarProps };
