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
const LIBELLES_BATIMENT = {
  floor_number: 'fields.floorNumber',
  total_floors: 'fields.totalFloors',
  year_built: 'fields.yearBuilt',
  parking_spaces: 'fields.parking',
} as const;

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

  // Les quatre mesures d'un bâtiment, dans l'ordre de la maquette ; un terrain n'en rend aucune.
  const grilleBatiment = ['floor_number', 'total_floors', 'year_built', 'parking_spaces'] as const;

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
      {/*
        TCK-2819 (lot 2) — maquette a-2 : les mesures dans UNE grille de deux colonnes, à toute largeur,
        « Meublé » en case dans la dernière cellule. La composition reste celle de la matrice : chaque
        cellule interroge `pertinent()`, aucune condition sur le type n'est écrite ici.
      */}
      <div className="grid grid-cols-2 gap-4">
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
        {/* TCK-633 (AC10) — les nombres se choisissent dans une liste. */}
        {pertinent('bedrooms') ? (
          <div className="wizard-field-rise">
            <NombreEnListe form={form} name="bedrooms" label={t('fields.bedrooms')} />
          </div>
        ) : null}
        {pertinent('bathrooms') ? (
          <div className="wizard-field-rise">
            <NombreEnListe form={form} name="bathrooms" label={t('fields.bathrooms')} />
          </div>
        ) : null}
        {grilleBatiment.filter(pertinent).map((cle) => (
          <div key={cle} className="wizard-field-rise" style={{ animationDelay: '60ms' }}>
            <NombreEnListe form={form} name={cle} label={t(LIBELLES_BATIMENT[cle])} />
          </div>
        ))}
        {pertinent('furnished') ? (
          <div className="wizard-field-rise flex items-end" style={{ animationDelay: '120ms' }}>
            <div className="flex min-h-11 w-full items-center rounded-lg border border-input bg-card px-3.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <FormCheckbox control={control} name="furnished" label={t('fields.furnished')} />
            </div>
          </div>
        ) : null}
      </div>

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
