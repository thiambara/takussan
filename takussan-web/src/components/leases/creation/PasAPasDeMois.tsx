'use client';

import { Minus, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * TCK-2643 — le pas-à-pas « − 2 mois + » de la caution (maquette `app-baux` a, `PasAPas`). Il ne
 * porte pas de valeur à lui : il écrit un MONTANT (mois × loyer) dans le champ de la caution, qui
 * reste la seule saisie (une caution libre, 75 500 F, reste possible — `montants-hors-pas.test.tsx`).
 * `mois` vaut `null` quand le montant n'est pas un nombre entier de loyers : le pas-à-pas affiche
 * alors « — » et repart du nombre entier inférieur.
 */
export function PasAPasDeMois({
  mois,
  plancher = 0,
  libelleMois,
  libelleMoins,
  libellePlus,
  onChange,
  max = 12,
  desactive,
  className,
}: {
  readonly mois: number | null;
  /** Le nombre entier de loyers sous un montant libre : d'où repart le pas-à-pas quand `mois` est nul. */
  readonly plancher?: number;
  /** « 2 mois », déjà traduit ; `null` → « — ». */
  readonly libelleMois: string | null;
  readonly libelleMoins: string;
  readonly libellePlus: string;
  readonly onChange: (mois: number) => void;
  readonly max?: number;
  /** Sans loyer, aucun mois ne se calcule. */
  readonly desactive?: boolean;
  readonly className?: string;
}) {
  const base = mois ?? plancher;
  const bouton =
    'inline-flex size-11 flex-none items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50';
  return (
    <div className={cn('flex h-11 items-center rounded-lg border border-border bg-card', className)}>
      <button
        type="button"
        aria-label={libelleMoins}
        className={bouton}
        disabled={desactive || base <= 0}
        onClick={() => onChange(Math.max(0, mois === null ? base : base - 1))}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span aria-live="polite" className="min-w-0 flex-1 truncate text-center text-corps font-medium tabular-nums">
        {libelleMois ?? '—'}
      </span>
      <button
        type="button"
        aria-label={libellePlus}
        className={bouton}
        disabled={desactive || base >= max}
        onClick={() => onChange(Math.min(max, base + 1))}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
