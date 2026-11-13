'use client';

import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { InventoryElementState } from '@/types/inventory';

import { ETAT_BON, ETAT_ENDOMMAGE, ETAT_USE } from './parcours';

/** Les trois pastilles de la maquette : « Abîmé » est l'alias de `endommagé`. « Manquant » vit dans la feuille de l'élément. */
const PASTILLES: readonly InventoryElementState[] = [ETAT_BON, ETAT_USE, ETAT_ENDOMMAGE];

/** La clé du message de chaque état (`inventory.terrain.etats.*`), sans accent. */
export const CLE_D_ETAT: Record<InventoryElementState, 'bon' | 'use' | 'abime' | 'manquant'> = { bon: 'bon', usé: 'use', endommagé: 'abime', manquant: 'manquant' };

/**
 * TCK-2647 — les pastilles d'état d'un élément (maquette `Pastilles3`) : Bon · Usé · Abîmé, choisies
 * d'un toucher, pleines quand elles sont choisies (succès, attention, danger). 48 px de haut au
 * téléphone, 36 au bureau (`compact`). Un groupe radio nommé par l'élément : les flèches passent d'un
 * état à l'autre, et un lecteur d'écran entend « Murs, Bon, 1 sur 3 ».
 *
 * « Manquant » reste choisissable (l'énumération a quatre valeurs) : la maquette n'a que trois
 * pastilles, il se pose dans la feuille de l'élément ; choisi, aucune pastille n'est pleine.
 */
export function Pastilles({
  valeur,
  onChange,
  element,
  compact = false,
  className,
}: {
  readonly valeur: InventoryElementState | null;
  readonly onChange: (etat: InventoryElementState) => void;
  /** Le libellé de l'élément : le nom du groupe. */
  readonly element: string;
  readonly compact?: boolean;
  readonly className?: string;
}) {
  const t = useTranslations('inventory.terrain.etats');
  return (
    <RadioGroupPrimitive
      aria-label={t('groupe', { element })}
      value={valeur ?? ''}
      onValueChange={(v) => onChange(v as InventoryElementState)}
      data-slot="pastilles"
      className={cn('flex flex-none gap-1.5', className)}
    >
      {PASTILLES.map((e) => {
        const actif = e === valeur;
        return (
          <RadioPrimitive.Root
            key={e}
            value={e}
            data-etat={CLE_D_ETAT[e]}
            className={cn(
              'inline-flex flex-1 items-center justify-center rounded-lg border text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring',
              compact ? 'h-9 min-w-16 px-2' : 'h-12 min-w-16.5 px-2',
              !actif && 'border-controle-vide bg-card text-encre-douce hover:bg-muted/50',
              actif && e === ETAT_BON && 'border-success bg-success text-success-foreground',
              actif && e === ETAT_USE && 'border-warning bg-warning text-warning-foreground',
              actif && e === ETAT_ENDOMMAGE && 'border-destructive bg-destructive text-background',
            )}
          >
            {t(CLE_D_ETAT[e])}
          </RadioPrimitive.Root>
        );
      })}
    </RadioGroupPrimitive>
  );
}
