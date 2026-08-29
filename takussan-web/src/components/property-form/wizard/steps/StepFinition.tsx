'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { FormInput, FormTextarea } from '@/components/forms';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { PROPERTY_ENUM_NAMESPACES } from '../../options';
import { suggestTitle } from '../suggest-title';

/**
 * Un `<input type="number">` rend une CHAÎNE à react-hook-form tant qu'on ne lui demande pas
 * `valueAsNumber` — et `PropertyFormValues` type ces champs en `unknown` (ce sont des `z.coerce`,
 * dont l'entrée n'est pas contrainte). `suggestTitle` attend des nombres : la conversion se fait
 * donc ici, une fois, plutôt que d'être supposée juste.
 */
function versNombre(valeur: unknown): number | undefined {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : undefined;
  if (typeof valeur === 'string' && valeur.trim() !== '') {
    const n = Number(valeur);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * TCK-464 — la dernière étape : un titre déjà composé, et une description facultative.
 *
 * Écrire un titre à froid est la chose la plus dure du formulaire, et c'était son PREMIER champ.
 * À la sixième étape, le type, la surface, les chambres et le quartier sont connus : on propose,
 * l'utilisateur corrige. Il n'invente plus, il arbitre.
 */
export function StepFinition({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {
  const t = useTranslations('property.wizard');
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const { control, watch, setValue, getValues } = form;
  const description = (watch('description') ?? '') as string;

  // Le titre n'est proposé QUE s'il est encore vide : une fois l'utilisateur passé dessus, sa
  // saisie l'emporte, y compris s'il revient en arrière changer la surface. Écraser un titre
  // saisi serait le pire des deux mondes — on lui aurait pris le champ ET le contrôle.
  useEffect(() => {
    if ((getValues('title') ?? '').trim().length > 0) return;
    const propose = suggestTitle(
      {
        type: getValues('type'),
        contract: getValues('contract_type'),
        area: versNombre(getValues('area')),
        bedrooms: versNombre(getValues('bedrooms')),
        quarter: getValues('quarter'),
        city: getValues('city'),
      },
      tType,
    );
    if (propose) setValue('title', propose, { shouldDirty: true, shouldValidate: true });
  }, [getValues, setValue, tType]);

  return (
    <>
      <FormInput control={control} name="title" label={t('fields.title')} required maxLength={200} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5" aria-hidden="true" />
        {t('titleComposedHint')}
      </p>
      <FormTextarea
        control={control}
        name="description"
        label={t('fields.description')}
        rows={4}
        placeholder={t('placeholders.description')}
      />
      <p className="text-right text-xs text-muted-foreground">
        {t('descriptionCounter', { count: description.length })}
      </p>
    </>
  );
}
