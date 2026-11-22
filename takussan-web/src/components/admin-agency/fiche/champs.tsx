'use client';

import type * as React from 'react';
import { useFormContext } from 'react-hook-form';

import { FormInput, FormTextarea } from '@/components/forms';
import type { ProfilDeChamp } from '@/components/ui/input';
import type { ProfilDeZone } from '@/components/ui/textarea';
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
  profil,
  placeholder,
  ...attributs
}: ChampProps & { readonly profil?: ProfilDeChamp } & Omit<
    React.ComponentProps<'input'>,
    'name' | 'defaultValue' | 'value' | 'onChange' | 'onBlur' | 'ref' | 'className'
  >) {
  const { control } = useFormContext<ValeursDeLaFiche>();
  const { modifie, manque } = useEtatDuChamp(name);
  return (
    <div className={className}>
      <FormInput
        control={control}
        name={name}
        label={<EtiquetteDuChamp libelle={libelle} modifie={modifie} manque={manque} />}
        className={cn('h-11 text-corps', classesDuChamp(modifie, manque))}
        // ADR-0135 — le profil et le placeholder de l'appelant, transmis tels quels. Les valeurs de la fiche sont du
        // texte (`ValeursDeLaFiche`) : un profil numérique y garde la chaîne tapée.
        profil={profil}
        garderLeTexte
        placeholder={placeholder}
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
  profil = 'texte-long',
  placeholder,
  ...attributs
}: ChampProps & { readonly compteur?: React.ReactNode; readonly profil?: ProfilDeZone } & Omit<
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
        profil={profil}
        placeholder={placeholder}
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
