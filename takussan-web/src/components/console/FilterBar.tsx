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
}: FilterBarProps) {
  return (
    <section className={cn('rounded-xl bg-card p-4 ring-1 ring-border', className)}>
      <div className={cn('grid gap-2 md:grid-cols-3 xl:grid-cols-4', controlsClassName)}>
        {children}
      </div>
      {resultCount || (onReset && resetLabel) ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{resultCount}</p>
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
