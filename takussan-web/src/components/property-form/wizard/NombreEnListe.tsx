'use client';

import { useTranslations } from 'next-intl';
import { Controller, type UseFormReturn } from 'react-hook-form';

import { FormError } from '@/components/forms';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PropertyFormValues } from '@/lib/schemas/property';

/** Les champs comptés du bien, et l'étendue que propose leur liste (ticket, lot D). */
export type ChampNombre = 'bedrooms' | 'bathrooms' | 'parking_spaces' | 'floor_number' | 'total_floors' | 'year_built';

function suite(de: number, a: number): number[] {
  const pas = de <= a ? 1 : -1;
  return Array.from({ length: Math.abs(a - de) + 1 }, (_, i) => de + i * pas);
}

/**
 * TCK-633 (AC10) — les nombres se CHOISISSENT : chambres 0-20, salles de bain 0-10, parking 0-20,
 * étage du sous-sol au 40e, niveaux 1-40, année de l'an prochain à 1900 (la plus récente en tête).
 * L'API garde des bornes plus larges (tâche 8) : un bien existant à 25 chambres reste éditable,
 * sa valeur est AJOUTÉE à la liste au lieu d'être effacée en silence.
 */
export function valeursProposees(champ: ChampNombre, annee: number = new Date().getFullYear()): number[] {
  switch (champ) {
    case 'bedrooms':
    case 'parking_spaces':
      return suite(0, 20);
    case 'bathrooms':
      return suite(0, 10);
    case 'floor_number':
      return suite(-1, 40);
    case 'total_floors':
      return suite(1, 40);
    case 'year_built':
      return suite(annee + 1, 1900);
  }
}

const AUCUNE = '';

export function NombreEnListe({
  form,
  name,
  label,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly name: ChampNombre;
  readonly label: string;
}) {
  const t = useTranslations('property.form.features');
  const id = `field-${name}`;
  const libelle = (n: number) =>
    name === 'floor_number' && n === -1 ? t('floorBasement')
    : name === 'floor_number' && n === 0 ? t('floorGround')
    : String(n);

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => {
        const brute = field.value as number | string | null | undefined;
        const actuelle = brute === null || brute === undefined || brute === '' ? null : Number(brute);
        const nombres = valeursProposees(name);
        if (actuelle !== null && !Number.isNaN(actuelle) && !nombres.includes(actuelle)) nombres.push(actuelle);
        const options = [
          { value: AUCUNE, label: t('notSpecified') },
          ...nombres.map((n) => ({ value: String(n), label: libelle(n) })),
        ];
        const erreur = fieldState.error?.message;
        return (
          <div className="w-full">
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
              {label}
            </label>
            <Select
              value={actuelle === null ? AUCUNE : String(actuelle)}
              // « Non précisé » rend `undefined` : le champ sort du corps, comme un champ vide
              // de l'ancienne saisie libre.
              onValueChange={(v) => field.onChange(v === AUCUNE || v === null ? undefined : Number(v))}
              items={options}
            >
              <SelectTrigger
                id={id}
                ref={field.ref}
                className="w-full"
                aria-invalid={erreur ? true : undefined}
                aria-describedby={erreur ? `${id}-error` : undefined}
              >
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
            <FormError id={`${id}-error`}>{erreur}</FormError>
          </div>
        );
      }}
    />
  );
}
