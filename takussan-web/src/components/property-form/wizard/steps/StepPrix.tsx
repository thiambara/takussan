'use client';

import { useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';

import { FormAmountInput, FormDatePicker, FormSelect } from '@/components/forms';
import type { PropertyFormValues } from '@/lib/schemas/property';
import {
  PROPERTY_ENUM_NAMESPACES,
  currencyOptions as fabriqueCurrencyOptions,
  rentPeriodOptions as fabriqueRentPeriodOptions,
} from '../../options';
import { isFieldRelevant } from '../../field-matrix';
import { WizardCollapsibleSection } from '../WizardCollapsibleSection';

/**
 * TCK-464 — le prix, et les deux champs qui n'existent qu'en location.
 *
 * La pertinence de `rent_period` vient de la matrice, jamais d'un `contract === 'rent'` écrit
 * ici : c'est la même règle qui purge le payload au moment de l'envoi, et deux écritures de la
 * même règle finissent toujours par diverger.
 */
export function StepPrix({ form }: { readonly form: UseFormReturn<PropertyFormValues> }) {
  const t = useTranslations('property.wizard');
  const tDevise = useTranslations(PROPERTY_ENUM_NAMESPACES.currency);
  const tPeriode = useTranslations(PROPERTY_ENUM_NAMESPACES.rentPeriod);
  const { control } = form;
  // TCK-564 — `useWatch`, jamais `watch()` lu pendant le rendu (cf. `StepBien`).
  const [type, contrat, devise] = useWatch({
    control,
    name: ['type', 'contract_type', 'currency'],
  });
  const ctx = { type, contract: contrat } as const;
  const location = isFieldRelevant('rent_period', ctx);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        {/*
          TCK-564 — le montant se relit pendant la frappe (« 49 000 000 »), et le formulaire reçoit
          toujours un NOMBRE. La devise décide des décimales : aucune en franc CFA.
        */}
        <FormAmountInput
          control={control}
          name="price"
          label={t('fields.price')}
          required
          currency={devise}
          example={location ? 350_000 : 25_000_000}
        />
        <FormSelect
          control={control}
          name="currency"
          label={t('fields.currency')}
          options={fabriqueCurrencyOptions(tDevise)}
        />
      </div>

      <WizardCollapsibleSection open={location} testId="bloc-location">
        <div className="space-y-5 pt-1">
          <FormSelect
            control={control}
            name="rent_period"
            label={t('fields.period')}
            options={fabriqueRentPeriodOptions(tPeriode)}
            placeholder={t('placeholders.period')}
          />
          <FormDatePicker
            control={control}
            name="available_from"
            label={t('fields.availableFrom')}
          />
        </div>
      </WizardCollapsibleSection>
    </>
  );
}
