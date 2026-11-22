'use client';

import { Radio as RadioPrimitive } from '@base-ui/react/radio';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';

import { cn } from '@/lib/utils';

/**
 * TCK-2801 (fiche TCK-2629, O2 et O3) — le contrôle segmenté des formulaires de « Rapports » (maquette
 * `Segments`, `plein grand`) : le format d'un export, la sévérité d'une alerte. Un groupe radio — une option,
 * et une seule, est choisie —, pleine largeur, 40 px par segment au téléphone ; le patron de
 * `SegmenteDesNatures` (réservations).
 */
export function Segmente<V extends string>({
  valeur,
  options,
  onChange,
  idDuLibelle,
}: {
  readonly valeur: V;
  readonly options: readonly { readonly valeur: V; readonly libelle: string }[];
  readonly onChange: (v: V) => void;
  /** L'`id` du libellé visible du champ (« Format », « Sévérité ») : le nom du groupe. */
  readonly idDuLibelle: string;
}) {
  return (
    <RadioGroupPrimitive
      aria-labelledby={idDuLibelle}
      value={valeur}
      onValueChange={(v) => onChange(v as V)}
      data-slot="segmente"
      className="flex rounded-lg bg-muted p-0.5"
    >
      {options.map((o) => (
        <RadioPrimitive.Root
          key={o.valeur}
          value={o.valeur}
          className={cn(
            'inline-flex h-10 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md px-3 text-ui font-medium outline-none',
            'focus-visible:ring-3 focus-visible:ring-ring',
            'data-checked:bg-card data-checked:text-foreground data-checked:shadow-sm',
            'data-unchecked:text-muted-foreground hover:data-unchecked:text-foreground',
          )}
        >
          {o.libelle}
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}
