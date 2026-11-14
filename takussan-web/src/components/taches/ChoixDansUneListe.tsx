'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface OptionDeListe {
  readonly value: string;
  readonly label: string;
}

interface ChoixDansUneListeProps {
  readonly id: string;
  readonly valeur: string;
  readonly options: readonly OptionDeListe[];
  readonly onChange: (valeur: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/**
 * Un choix dans une liste (l'assigné d'une tâche, la vue d'équipe) sur la primitive `ui/select` :
 * le libellé est un `<label htmlFor={id}>` chez l'appelant.
 */
export function ChoixDansUneListe({ id, valeur, options, onChange, disabled, className }: ChoixDansUneListeProps) {
  return (
    <Select
      value={valeur}
      disabled={disabled}
      onValueChange={(suivante) => {
        if (suivante !== null && suivante !== valeur) onChange(String(suivante));
      }}
      items={options as OptionDeListe[]}
    >
      <SelectTrigger id={id} className={cn('w-full', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
