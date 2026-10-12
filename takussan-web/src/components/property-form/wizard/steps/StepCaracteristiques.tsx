'use client';

import { useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { FormCheckbox, FormInput } from '@/components/forms';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { conditionValues, titleTypeValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';
import { ChampEquipements } from '../../ChampEquipements';
import { areaLabelKey, isFieldRelevant, type ConditionalFieldKey } from '../../field-matrix';
import { PROPERTY_ENUM_NAMESPACES } from '../../options';
import { ChoiceChips } from '../ChoiceChips';
import { NombreEnListe } from '../NombreEnListe';

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
  const tTitre = useTranslations(PROPERTY_ENUM_NAMESPACES.titleType);
  const tEtat = useTranslations(PROPERTY_ENUM_NAMESPACES.condition);
  const { control, setValue, getValues } = form;
  // TCK-564 — `useWatch`, jamais `watch()` lu pendant le rendu (cf. `StepBien` et
  // `__tests__/abonnement-des-etapes.test.tsx`). Compilé, `watch('title_type')` restait figé à sa
  // première valeur : « Bail » cliqué ne s'allumait pas, et recliquer ne l'effaçait pas.
  const [type, contrat, titreActuel, etatSuivi] = useWatch({
    control,
    name: ['type', 'contract_type', 'title_type', 'condition'],
  });
  const ctx = { type, contract: contrat } as const;
  const pertinent = (cle: ConditionalFieldKey) => isFieldRelevant(cle, ctx);
  const etatActuel = etatSuivi || undefined;

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

        ⚠ `pertinent('area')` répond `true` pour les seize types AUJOURD'HUI (field-matrix.ts) —
        mais c'est la matrice qui le dit, pas cette ligne. La rendre inconditionnellement serait la
        seule des douze clés conditionnelles à ne pas interroger la matrice, et c'est précisément
        le genre d'exception qui survit à un changement de la règle.
      */}
      {pertinent('area') ? (
        <FormInput
          control={control}
          name="area"
          label={t(areaLabelKey(ctx.type))}
          type="number"
          inputMode="numeric"
          min={0}
          placeholder={t('placeholders.area')}
        />
      ) : null}

      {pertinent('bedrooms') || pertinent('bathrooms') ? (
        <div className="wizard-field-rise grid gap-4 sm:grid-cols-2">
          {/* TCK-633 (AC10) — les nombres se choisissent dans une liste. */}
          {pertinent('bedrooms') ? (
            <NombreEnListe form={form} name="bedrooms" label={t('fields.bedrooms')} />
          ) : null}
          {pertinent('bathrooms') ? (
            <NombreEnListe form={form} name="bathrooms" label={t('fields.bathrooms')} />
          ) : null}
        </div>
      ) : null}

      {grilleBatiment.some(pertinent) ? (
        <div className="wizard-field-rise grid gap-4 sm:grid-cols-2" style={{ animationDelay: '60ms' }}>
          {pertinent('floor_number') ? (
            <NombreEnListe form={form} name="floor_number" label={t('fields.floorNumber')} />
          ) : null}
          {pertinent('total_floors') ? (
            <NombreEnListe form={form} name="total_floors" label={t('fields.totalFloors')} />
          ) : null}
          {pertinent('year_built') ? (
            <NombreEnListe form={form} name="year_built" label={t('fields.yearBuilt')} />
          ) : null}
          {pertinent('parking_spaces') ? (
            <NombreEnListe form={form} name="parking_spaces" label={t('fields.parking')} />
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
            // La valeur se relit AU CLIC (`getValues`) et non dans la fermeture du rendu : la
            // bascule ne dépend alors d'aucune fraîcheur de rendu.
            onChange={(v) =>
              setValue(
                'title_type',
                v === getValues('title_type') ? undefined : (v as PropertyFormValues['title_type']),
                { shouldDirty: true },
              )
            }
            options={titleTypeValues.map((v) => ({ value: v, label: tTitre(v) }))}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">{t('titleTypeHint')}</p>
        </div>
      ) : null}

      {pertinent('condition') ? (
        <div className="wizard-field-rise space-y-2" style={{ animationDelay: '210ms' }}>
          <ChoiceChips
            id="wizard-condition"
            label={t('fields.condition')}
            value={etatActuel}
            // TCK-508 — FACULTATIF comme le statut foncier : recliquer la pastille enfoncée
            // l'efface, c'est l'équivalent de « Non précisé » du formulaire d'édition.
            onChange={(v) =>
              setValue(
                'condition',
                v === getValues('condition') ? undefined : (v as PropertyFormValues['condition']),
                { shouldDirty: true },
              )
            }
            options={conditionValues.map((v) => ({ value: v, label: tEtat(v) }))}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">{t('conditionHint')}</p>
        </div>
      ) : null}

      {/* TCK-633 (AC10) — rendu même sans catalogue : un équipement se propose par Entrée. */}
      {pertinent('tag_ids') ? (
        <div className="wizard-field-rise" style={{ animationDelay: '240ms' }}>
          <ChampEquipements form={form} tags={tags} label={t('fields.amenities')} />
        </div>
      ) : null}
    </>
  );
}
