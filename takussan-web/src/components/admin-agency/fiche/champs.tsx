'use client';

import type * as React from 'react';
import { useFormContext } from 'react-hook-form';

import { FormInput, FormTextarea } from '@/components/forms';
import type { ValeursDeLaFiche } from '@/lib/agence/fiche';
import { cn } from '@/lib/utils';

import { useEtatDuChamp } from './contexte';
import { EtiquetteDuChamp, classesDuChamp } from './pieces';

type NomDuChamp = Extract<keyof ValeursDeLaFiche, string>;

interface ChampProps {
  readonly name: NomDuChamp;
  readonly libelle: string;
  readonly aide?: React.ReactNode;
  readonly className?: string;
}

/** Un champ texte de la fiche : son libellé, son étiquette « modifié » / « à remplir », son aide. */
export function ChampDeLaFiche({
  name,
  libelle,
  aide,
  className,
  ...attributs
}: ChampProps & Omit<React.ComponentProps<'input'>, 'name' | 'defaultValue' | 'value' | 'onChange' | 'onBlur' | 'ref' | 'className'>) {
  const { control } = useFormContext<ValeursDeLaFiche>();
  const { modifie, manque } = useEtatDuChamp(name);
  return (
    <div className={className}>
      <FormInput
        control={control}
        name={name}
        label={<EtiquetteDuChamp libelle={libelle} modifie={modifie} manque={manque} />}
        className={cn('h-11 text-corps', classesDuChamp(modifie, manque))}
        {...attributs}
      />
      {aide ? <p className="mt-1 text-pretty text-xs text-muted-foreground">{aide}</p> : null}
    </div>
  );
}

/** Une zone de texte de la fiche, avec son compteur quand elle a une borne. */
export function ZoneDeLaFiche({
  name,
  libelle,
  aide,
  className,
  compteur,
  ...attributs
}: ChampProps & { readonly compteur?: React.ReactNode } & Omit<
    React.ComponentProps<'textarea'>,
    'name' | 'defaultValue' | 'value' | 'onChange' | 'onBlur' | 'ref' | 'className'
  >) {
  const { control } = useFormContext<ValeursDeLaFiche>();
  const { modifie, manque } = useEtatDuChamp(name);
  return (
    <div className={className}>
      <FormTextarea
        control={control}
        name={name}
        label={<EtiquetteDuChamp libelle={libelle} modifie={modifie} manque={manque} />}
        className={cn('min-h-[5.5rem] text-corps', classesDuChamp(modifie, manque))}
        {...attributs}
      />
      {aide || compteur ? (
        <div className="mt-1 flex items-start gap-3">
          {aide ? <p className="min-w-0 flex-1 text-pretty text-xs text-muted-foreground">{aide}</p> : <span className="flex-1" />}
          {compteur ? <p className="flex-none text-xs tabular-nums text-muted-foreground">{compteur}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
