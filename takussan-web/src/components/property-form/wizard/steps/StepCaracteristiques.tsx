'use client';

import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';

import { FormCheckbox, FormInput } from '@/components/forms';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { titleTypeValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';
import { areaLabelKey, isFieldRelevant, type ConditionalFieldKey } from '../../field-matrix';
import { ChoiceChips } from '../ChoiceChips';

/**
 * TCK-464 — l'étape des caractéristiques ne DÉCIDE rien : elle demande à la matrice.
 *
 * C'est l'étape où « on ne demande pas le nombre de chambres pour un terrain » se joue, et c'est
 * exactement pour cela qu'elle ne doit contenir AUCUNE condition sur le type. `isFieldRelevant`
 * est la seule source de vérité — la même que lit la sérialisation du payload et que lira la
 * page d'édition. Une condition écrite en clair ici serait une deuxième version de la règle, et
 * la deuxième version est toujours celle qui diverge en silence.
 *
 * C'est aussi la seule étape dont la COMPOSITION varie : c'est donc ici que `.wizard-field-rise`
 * (globals.css) trouve son emploi, avec un `animation-delay` croissant. Les blocs conditionnels
 * montent et démontent au changement de type — sans la cascade, ils apparaissent d'un coup, en
 * bloc, sous le doigt. Le décalage est porté par un style en ligne parce qu'il dépend du RANG du
 * bloc, ce qu'une classe ne sait pas exprimer ; l'animation, elle, reste dans `globals.css`, où
 * `prefers-reduced-motion` la neutralise (AC8).
 *
 * ⚠ Aucun `useCallback` / `useMemo` : le React Compiler s'en charge (ADR-0015), et une
 * mémoïsation manuelle fait ABANDONNER la compilation de tout le composant.
 */
export function StepCaracteristiques({
  form,
  tags,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly tags: readonly Tag[];
}) {
  const t = useTranslations('property.wizard');
  const tTitre = useTranslations('property.titleTypes');
  const { control, watch, setValue } = form;
  const ctx = { type: watch('type'), contract: watch('contract_type') } as const;
  const pertinent = (cle: ConditionalFieldKey) => isFieldRelevant(cle, ctx);
  const tagIds = (watch('tag_ids') ?? []) as number[];
  const titreActuel = watch('title_type');

  // Un terrain ne rend AUCUN des quatre : sans ce garde, la grille resterait montée, vide, et
  // l'espacement de l'étape s'ouvrirait sur rien.
  const grilleBatiment: readonly ConditionalFieldKey[] = [
    'floor_number', 'total_floors', 'year_built', 'parking_spaces',
  ];

  return (
    <>
      {/*
        La surface se demande TOUJOURS ; seul son libellé change. Un terrain se mesure en surface
        de parcelle, un logement en surface habitable — ce n'est pas la même grandeur, et les
        confondre fausse la comparaison entre deux annonces.
      */}
      <FormInput
        control={control}
        name="area"
        label={t(areaLabelKey(ctx.type))}
        type="number"
        inputMode="numeric"
        min={0}
        placeholder={t('placeholders.area')}
      />

      {pertinent('bedrooms') || pertinent('bathrooms') ? (
        <div className="wizard-field-rise grid gap-4 sm:grid-cols-2">
          {pertinent('bedrooms') ? (
            <FormInput control={control} name="bedrooms" label={t('fields.bedrooms')}
              type="number" inputMode="numeric" min={0} />
          ) : null}
          {pertinent('bathrooms') ? (
            <FormInput control={control} name="bathrooms" label={t('fields.bathrooms')}
              type="number" inputMode="numeric" min={0} />
          ) : null}
        </div>
      ) : null}

      {grilleBatiment.some(pertinent) ? (
        <div className="wizard-field-rise grid gap-4 sm:grid-cols-2" style={{ animationDelay: '60ms' }}>
          {pertinent('floor_number') ? (
            <FormInput control={control} name="floor_number" label={t('fields.floorNumber')}
              type="number" inputMode="numeric" min={-5} max={200} />
          ) : null}
          {pertinent('total_floors') ? (
            <FormInput control={control} name="total_floors" label={t('fields.totalFloors')}
              type="number" inputMode="numeric" min={1} max={200} />
          ) : null}
          {pertinent('year_built') ? (
            <FormInput control={control} name="year_built" label={t('fields.yearBuilt')}
              type="number" inputMode="numeric" min={1800} max={2100}
              placeholder={t('placeholders.yearBuilt')} />
          ) : null}
          {pertinent('parking_spaces') ? (
            <FormInput control={control} name="parking_spaces" label={t('fields.parking')}
              type="number" inputMode="numeric" min={0} placeholder={t('placeholders.parking')} />
          ) : null}
        </div>
      ) : null}

      {pertinent('furnished') ? (
        <div className="wizard-field-rise" style={{ animationDelay: '120ms' }}>
          <FormCheckbox control={control} name="furnished" label={t('fields.furnished')} />
        </div>
      ) : null}

      {pertinent('title_type') ? (
        <div className="wizard-field-rise space-y-2" style={{ animationDelay: '180ms' }}>
          <ChoiceChips
            id="wizard-title-type"
            label={t('fields.titleType')}
            value={titreActuel}
            // Le statut foncier est FACULTATIF : recliquer la pastille enfoncée l'efface. C'est
            // la raison pour laquelle `ChoiceChips` expose `aria-pressed` et non un groupe de
            // radios, qui ne se désélectionne pas.
            onChange={(v) =>
              setValue(
                'title_type',
                v === titreActuel ? undefined : (v as PropertyFormValues['title_type']),
                { shouldDirty: true },
              )
            }
            options={titleTypeValues.map((v) => ({ value: v, label: tTitre(v) }))}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">{t('titleTypeHint')}</p>
        </div>
      ) : null}

      {pertinent('tag_ids') && tags.length > 0 ? (
        <div className="wizard-field-rise" style={{ animationDelay: '240ms' }}>
          <ChoiceChips
            id="wizard-tags"
            label={t('fields.amenities')}
            value={undefined}
            // Sélection MULTIPLE : c'est `selected` qui montre ce qui est déjà retenu. Sans elle,
            // rien à l'écran ne distinguait un équipement coché d'un équipement disponible.
            selected={tagIds.map(String)}
            onChange={(v) => {
              const id = Number(v);
              setValue(
                'tag_ids',
                tagIds.includes(id) ? tagIds.filter((x) => x !== id) : [...tagIds, id],
                { shouldDirty: true },
              );
            }}
            options={tags.map((tag) => ({
              value: String(tag.id),
              label: tag.name,
              icon: tag.icon ?? undefined,
            }))}
          />
        </div>
      ) : null}
    </>
  );
}
