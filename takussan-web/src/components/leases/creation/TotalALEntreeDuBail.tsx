'use client';

import { useTranslations } from 'next-intl';

import type { TotalALEntree } from '@/lib/cout-d-entree';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

/**
 * TCK-2643 — « Total à l'entrée » (maquette `app-baux` a, `TotalEntree`) : la somme due à la remise
 * des clés, puis son détail — « Loyer … + charges … + caution … » —, calculés sur les valeurs SAISIES
 * (`totalALEntreeDuBail`, la formule du coût d'entrée du bien). Une vente montre son prix ; un loyer
 * pas encore saisi le dit.
 */
export function TotalALEntreeDuBail({
  total,
  prixDeVente,
  devise,
  className,
}: {
  readonly total: TotalALEntree | null;
  /** Une vente : le prix, à la place du total. */
  readonly prixDeVente?: number | null;
  readonly devise: string;
  readonly className?: string;
}) {
  const t = useTranslations('lease.form.total');
  const { montantCourt } = useFormatteurs();
  const vente = prixDeVente !== undefined;

  return (
    <div data-slot="total-a-l-entree" className={cn('rounded-xl bg-secondary p-4', className)}>
      <p className="text-ui text-primary-deep">{vente ? t('vente') : t('titre')}</p>
      {vente ? (
        <p className="mt-0.5 font-display text-affiche-28 font-semibold leading-tight tracking-titre tabular-nums">
          {montantCourt(prixDeVente ?? null, devise)}
        </p>
      ) : total ? (
        <>
          <p className="mt-0.5 font-display text-affiche-28 font-semibold leading-tight tracking-titre tabular-nums">
            {montantCourt(total.total, devise)}
          </p>
          <p className="mt-1 text-ui text-muted-foreground">{detailDuTotal(total, (cle, montant) => t(cle, { montant: montantCourt(montant, devise) }))}</p>
        </>
      ) : (
        <p className="mt-1 text-ui text-muted-foreground">{t('vide')}</p>
      )}
    </div>
  );
}

/**
 * « Loyer 670 000 F + charges 25 000 F + caution 1 340 000 F » : les seules parts non nulles (un bien
 * sans mois d'avance n'a ni loyer ni charges à l'entrée), la première lettre en capitale.
 */
function detailDuTotal(total: TotalALEntree, part: (cle: 'loyer' | 'charges' | 'caution' | 'frais', montant: number) => string): string {
  const parts = (
    [
      ['loyer', total.loyer],
      ['charges', total.charges],
      ['caution', total.caution],
      ['frais', total.frais],
    ] as const
  )
    .filter(([, montant]) => montant > 0)
    .map(([cle, montant]) => part(cle, montant))
    .join(' + ');
  return parts.charAt(0).toLocaleUpperCase() + parts.slice(1);
}
