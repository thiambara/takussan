'use client';

import { useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { FormAmountInput, FormInput } from '@/components/forms';
import { FormDatePicker } from '@/components/forms/FormDatePicker';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { isFieldRelevant } from '../../field-matrix';
import { ChoiceChips } from '../ChoiceChips';
import { EncadreCoutDEntree, useRetirerLesFraisDAgence } from '../EncadreCoutDEntree';
import { WizardCollapsibleSection } from '../WizardCollapsibleSection';

/**
 * TCK-2819 (lot 2) — les quatre valeurs de `rentPeriodValues`, dans l'ordre de la maquette (« Par
 * Mois · Semaine · Jour · An ») : le mois d'abord, c'est le cas courant.
 */
const PERIODES = ['monthly', 'weekly', 'daily', 'yearly'] as const;

/**
 * TCK-464 — le prix, et les deux champs qui n'existent qu'en location.
 *
 * La pertinence de `rent_period` vient de la matrice, jamais d'un `contract === 'rent'` écrit
 * ici : c'est la même règle qui purge le payload au moment de l'envoi, et deux écritures de la
 * même règle finissent toujours par diverger.
 */
/**
 * TCK-598 (V9) — les quatre champs du coût d'entrée, partagés par le parcours de création et la
 * page d'édition : une seule mise en page, un seul jeu de libellés.
 *
 * TCK-633 — `fraisDAgence` : un indépendant (agence `individual`) ne facture pas de frais
 * d'agence, et l'API les refuse pour lui (`StorePropertyRequest`, tâche 8). Le champ n'est pas
 * rendu, et une valeur déjà là (brouillon, bien existant) est RETIRÉE — marquée modifiée, pour que
 * l'édition envoie `null` (`withClearedFields`) au lieu de laisser l'ancienne valeur en base.
 */
export function EntryCostFields({
  form,
  devise,
  fraisDAgence = true,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly devise: PropertyFormValues['currency'];
  readonly fraisDAgence?: boolean;
}) {
  const t = useTranslations('property.wizard.entryCost');
  const { control } = form;
  useRetirerLesFraisDAgence(form, fraisDAgence);

  return (
    <fieldset className="space-y-3 pt-1">
      <legend className="text-sm font-medium text-foreground">{t('legend')}</legend>
      <p className="text-xs text-muted-foreground">{t('hint')}</p>
      <div className={fraisDAgence ? 'grid gap-4 sm:grid-cols-3' : 'grid gap-4 sm:grid-cols-2'}>
        <FormInput control={control} name="advance_months" label={t('advance')} type="number" min={0} max={24} step={1} inputMode="numeric" />
        <FormInput control={control} name="deposit_months" label={t('deposit')} type="number" min={0} max={24} step={1} inputMode="numeric" />
        {fraisDAgence ? (
          <FormInput control={control} name="agency_fee_months" label={t('agencyFee')} type="number" min={0} max={24} step={0.5} inputMode="decimal" />
        ) : null}
      </div>
      <FormAmountInput
        control={control}
        name="monthly_charges"
        label={t('monthlyCharges')}
        currency={devise}
        example={10_000}
      />
    </fieldset>
  );
}

/**
 * TCK-2819 (lot 2) — l'étape du prix d'après la maquette `app-entree-publier` (écran a-3) : le loyer en
 * F CFA, sa fréquence en pastilles (« Par Mois · Semaine · Jour · An ») au lieu d'une liste, la date de
 * disponibilité, puis l'encadré « Coût d’entrée » (`EncadreCoutDEntree`) et son « Total à l’entrée ».
 *
 * La fréquence garde la sémantique d'un groupe de radios (choix unique, flèches), et son nom accessible
 * reste « Fréquence » : « Par » n'est que le début de la phrase qu'on lit à l'écran.
 */
export function StepPrix({
  form,
  fraisDAgence = true,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  /** TCK-633 — faux pour un indépendant : cf. `EncadreCoutDEntree`. */
  readonly fraisDAgence?: boolean;
}) {
  const t = useTranslations('property.wizard');
  const { control, setValue } = form;
  // TCK-564 — `useWatch`, jamais `watch()` lu pendant le rendu (cf. `StepBien`). La devise n'est
  // plus un choix (TCK-633, ADR-0061) mais reste lue : elle décide des décimales du montant.
  const [type, contrat, devise, periode] = useWatch({
    control,
    name: ['type', 'contract_type', 'currency', 'rent_period'],
  });
  const ctx = { type, contract: contrat, rentPeriod: periode } as const;
  const location = isFieldRelevant('rent_period', ctx);
  // TCK-598 (V9) — le coût d'entrée, d'une location MENSUELLE seulement : la même règle qui retire
  // ces champs du corps à l'envoi, sans quoi l'API rendrait 422.
  const coutDEntree = isFieldRelevant('deposit_months', ctx);

  return (
    <>
      {/*
        TCK-564 — le montant se relit pendant la frappe (« 250 000 »), et le formulaire reçoit toujours
        un NOMBRE. TCK-633 — la devise ne se choisit plus (ADR-0061) : « F CFA » est l'unité du champ.
      */}
      {/* Au bureau, le loyer et sa fréquence sur une ligne (maquette : `grid-cols-[1fr_auto]`). */}
      <div className="space-y-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-5 lg:space-y-0">
        <FormAmountInput
          control={control}
          name="price"
          label={location ? t('fields.rent') : t('fields.price')}
          required
          currency={devise}
          unite={t('currencyUnit')}
          example={location ? 350_000 : 25_000_000}
        />
        <WizardCollapsibleSection open={location} testId="bloc-location">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="mr-1 text-sm text-muted-foreground">{t('periodPrefix')}</span>
            <ChoiceChips
              id="wizard-rent-period"
              label={t('fields.period')}
              labelMasque
              radioGroup
              value={periode ?? 'monthly'}
              onChange={(v) =>
                setValue('rent_period', v as PropertyFormValues['rent_period'], { shouldDirty: true })
              }
              options={PERIODES.map((v) => ({ value: v, label: t(`periodChips.${v}`) }))}
            />
          </div>
        </WizardCollapsibleSection>
      </div>
      <WizardCollapsibleSection open={location} testId="bloc-disponibilite">
        <FormDatePicker control={control} name="available_from" label={t('fields.availableFrom')} />
      </WizardCollapsibleSection>

      <WizardCollapsibleSection open={coutDEntree} testId="bloc-cout-d-entree">
        <EncadreCoutDEntree form={form} fraisDAgence={fraisDAgence} />
      </WizardCollapsibleSection>
    </>
  );
}
