'use client';

import { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';

import { FormDatePicker, FormInput, FormSelect } from '@/components/forms';
import type { PropertyFormValues } from '@/lib/schemas/property';
import {
  PROPERTY_ENUM_NAMESPACES,
  currencyOptions as fabriqueCurrencyOptions,
  rentPeriodOptions as fabriqueRentPeriodOptions,
} from '../../options';
import { isFieldRelevant } from '../../field-matrix';

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
  const { control, watch } = form;
  const ctx = { type: watch('type'), contract: watch('contract_type') } as const;
  const location = isFieldRelevant('rent_period', ctx);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <FormInput
          control={control}
          name="price"
          label={t('fields.price')}
          required
          type="number"
          inputMode="numeric"
          min={0}
          placeholder={location ? t('placeholders.priceRent') : t('placeholders.priceSale')}
        />
        <FormSelect
          control={control}
          name="currency"
          label={t('fields.currency')}
          options={fabriqueCurrencyOptions(tDevise)}
        />
      </div>

      {/*
        Le bloc replié reste dans le DOM pour que la transition de hauteur existe, mais il sort de
        l'arbre d'accessibilité ET du parcours clavier — sans quoi un lecteur d'écran annoncerait
        deux champs invisibles, et le tabulateur s'y arrêterait. `aria-hidden` seul sur des
        éléments focusables est en soi une violation.
      */}
      <div
        data-testid="bloc-location"
        aria-hidden={!location}
        inert={!location}
        className="grid transition-[grid-template-rows,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ gridTemplateRows: location ? '1fr' : '0fr', opacity: location ? 1 : 0 }}
      >
        <div className="overflow-hidden">
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
        </div>
      </div>
    </>
  );
}
