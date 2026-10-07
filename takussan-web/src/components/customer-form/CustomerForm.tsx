'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Controller } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  FormError,
  FormGlobalError,
  FormInput,
  FormSelect,
} from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { ApiError } from '@/lib/api';
import {
  customerFormSchema,
  customerStatusValues,
  idTypeValues,
  normaliseCustomerForm,
  pipelineStageValues,
  seekingContractTypeValues,
  seekingPropertyTypeValues,
  type CustomerFormValues,
} from '@/lib/schemas/customer';
import {
  createCustomerAction,
  updateCustomerAction,
  type CustomerDuplicateMatch,
} from '@/app/actions/dashboard-customers';
import type { CustomerDetail } from '@/types/customer';


/**
 * Customer create / edit form — TCK-042.
 */

interface CustomerFormProps {
  readonly mode: 'create' | 'edit';
  readonly customer?: CustomerDetail;
  readonly onSuccess?: (customer: CustomerDetail) => void;
  readonly compact?: boolean;
}

function toDefaults(customer?: CustomerDetail): CustomerFormValues {
  if (!customer) {
    return {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      occupation: '',
      pipeline_stage: 'lead',
      status: 'active',
      id_type: '',
      id_number: '',
      seeking_contract_type: '',
      budget_min: '',
      budget_max: '',
      seeking_property_types: [],
      seeking_cities: '',
      seeking_neighborhoods: '',
      min_bedrooms: '',
    };
  }
  // `decimal:2` rend « 300000.00 » : on l'affiche sans ses zéros.
  const montant = (v: string | null | undefined) => (v == null ? '' : String(Number(v)));
  return {
    first_name: customer.first_name ?? '',
    last_name: customer.last_name ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? '',
    occupation: customer.occupation ?? '',
    pipeline_stage: (customer.pipeline_stage ?? 'lead') as CustomerFormValues['pipeline_stage'],
    status: (customer.status ?? 'active') as CustomerFormValues['status'],
    id_type: (customer.id_type ?? '') as CustomerFormValues['id_type'],
    id_number: customer.id_number ?? '',
    seeking_contract_type: customer.seeking_contract_type ?? '',
    budget_min: montant(customer.budget_min),
    budget_max: montant(customer.budget_max),
    seeking_property_types: customer.seeking_property_types ?? [],
    seeking_cities: (customer.seeking_cities ?? []).join(', '),
    seeking_neighborhoods: (customer.seeking_neighborhoods ?? []).join(', '),
    min_bedrooms: customer.min_bedrooms == null ? '' : String(customer.min_bedrooms),
  };
}

export function CustomerForm({
  mode,
  customer,
  onSuccess,
  compact,
}: CustomerFormProps) {
  const t = useTranslations('crm.form');
  const tCommon = useTranslations('common.actions');
  const tStage = useTranslations('crm.pipeline.stage');
  const tStatus = useTranslations('crm.customerStatus');
  const tIdType = useTranslations('crm.idTypes');
  const tCrm = useTranslations('agentCrm.form');
  const tPropertyType = useTranslations('property.types');
  const tContract = useTranslations('property.contractTypes');
  const router = useRouter();

  // TCK-591 — un 409 `customer_duplicate` n'est pas une erreur mais une aide : on montre la fiche
  // existante, et « Créer quand même » renvoie le même formulaire avec `allow_duplicate`.
  const [duplicates, setDuplicates] = useState<CustomerDuplicateMatch[] | null>(null);
  const allowDuplicate = useRef(false);

  // La donnée porte la CLÉ, le rendu la résout (patron TCK-286). Les tables
  // françaises de `./options` restent en place tant que `app/(dashboard)/app/
  // customers/[id]/page.tsx` — hors de ce lot — les importe.
  const pipelineStageOptions = pipelineStageValues.map((v) => ({ value: v, label: tStage(v) }));
  const customerStatusOptions = customerStatusValues.map((v) => ({ value: v, label: tStatus(v) }));
  const idTypeOptions = idTypeValues.map((v) => ({ value: v, label: tIdType(v) }));

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } =
    useApiForm<CustomerFormValues, CustomerDetail>({
      schema: customerFormSchema,
      defaultValues: toDefaults(customer),
      onSubmit: async (values) => {
        const payload = {
          ...normaliseCustomerForm(values),
          ...(allowDuplicate.current ? { allow_duplicate: true } : {}),
        };
        allowDuplicate.current = false;
        setDuplicates(null);
        const result =
          mode === 'edit' && customer
            ? await updateCustomerAction(customer.id, payload)
            : await createCustomerAction(payload);
        if (!result.ok) {
          if (result.duplicates) setDuplicates(result.duplicates);
          throw new ApiError(result.status ?? 500, {
            message: result.message,
            errors: result.errors,
          });
        }
        return result.data as CustomerDetail;
      },
      onSuccess: async (result) => {
        if (onSuccess) {
          onSuccess(result);
          return;
        }
        router.push(`/app/customers/${result.id}`);
        router.refresh();
      },
    });

  const { control } = form;
  // « Indifférent » est une option à part entière : sans elle, un type choisi ne s'effaçait plus.
  // `any` n'est pas une valeur de l'API — `normaliseCustomerForm` la rend en `null`.
  const contractOptions = [
    { value: 'any', label: tCrm('criteria.any') },
    ...seekingContractTypeValues.map((v) => ({ value: v, label: tContract(v) })),
  ];
  const confirmDuplicate = () => {
    allowDuplicate.current = true;
    void handleSubmit();
  };
  // `lg` et non `md` : sous la barre latérale, 768 laisse ~416 px à la carte du formulaire, soit
  // deux champs de 200 px (revue design 2026-09-16, règle TCK-505).

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {duplicates ? (
        <div role="status" className="space-y-2 rounded-lg border border-accent/40 bg-accent/10 p-4 text-sm">
          <p className="font-medium text-foreground">{tCrm('duplicate.title')}</p>
          <ul className="space-y-1">
            {duplicates.map((d, i) => (
              <li key={d.id ?? `hidden-${i}`} className="flex flex-wrap items-center gap-x-2">
                <span>
                  {d.name ?? tCrm('duplicate.hidden')}
                  {' · '}
                  {tCrm(`duplicate.matchedOn.${d.matched_on}`)}
                </span>
                {d.id !== null ? (
                  <Link href={`/app/customers/${d.id}`} className="underline underline-offset-2">
                    {tCrm('duplicate.open')}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" onClick={confirmDuplicate} disabled={isSubmitting}>
            {mode === 'create' ? tCrm('duplicate.createAnyway') : tCrm('duplicate.saveAnyway')}
          </Button>
        </div>
      ) : null}

      <FormGlobalError>
        {globalError && !duplicates ? (
          <span className="flex items-center justify-between gap-4">
            <span>{globalError}</span>
            <button
              type="button"
              onClick={clearGlobalError}
              className="shrink-0 rounded-sm px-1 py-1 text-xs underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {tCommon('close')}
            </button>
          </span>
        ) : null}
      </FormGlobalError>

      <div className={compact ? 'space-y-4' : 'rounded-xl bg-card p-6 space-y-4'}>
        <div className="grid gap-4 lg:grid-cols-2">
          <FormInput control={control} name="first_name" label={t('firstName')} required />
          <FormInput control={control} name="last_name" label={t('lastName')} required />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <FormInput
            control={control}
            name="email"
            label={t('email')}
            type="email"
            autoComplete="email"
          />
          {/* TCK-591 — la saisie du profil (TCK-566/574) : indicatif en préfixe, valeur en E.164. */}
          <Controller
            control={control}
            name="phone"
            render={({ field, fieldState }) => (
              <div className="w-full">
                <label htmlFor="field-phone" className="mb-1.5 block text-sm font-medium">{t('phone')}</label>
                <PhoneInput
                  id="field-phone"
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  aria-invalid={fieldState.error ? true : undefined}
                  aria-describedby={fieldState.error ? 'field-phone-error' : undefined}
                />
                <FormError id="field-phone-error">{fieldState.error?.message}</FormError>
              </div>
            )}
          />
        </div>
        <FormInput
          control={control}
          name="occupation"
          label={t('occupation')}
          placeholder={t('occupationPlaceholder')}
        />
      </div>

      <div className={compact ? 'space-y-4' : 'rounded-xl bg-card p-6 space-y-4'}>
        {!compact ? (
          <h2 className="font-display text-base font-semibold tracking-tight text-foreground">{t('crmSection')}</h2>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <FormSelect
            control={control}
            name="pipeline_stage"
            label={t('pipelineStage')}
            options={pipelineStageOptions}
          />
          <FormSelect
            control={control}
            name="status"
            label={t('status')}
            options={customerStatusOptions}
          />
        </div>
      </div>

      {/* TCK-591 §5 — ce que le prospect cherche ; le rapprochement et le résumé du matin en partent. */}
      <fieldset className={compact ? 'space-y-4' : 'rounded-xl bg-card p-6 space-y-4'}>
        <legend className="font-display text-base font-semibold tracking-tight text-foreground">
          {tCrm('criteria.title')}
        </legend>
        <div className="grid gap-4 lg:grid-cols-2">
          <FormSelect
            control={control}
            name="seeking_contract_type"
            label={tCrm('criteria.contractType')}
            options={contractOptions}
            placeholder={tCrm('criteria.any')}
          />
          <FormInput
            control={control}
            name="min_bedrooms"
            label={tCrm('criteria.minBedrooms')}
            inputMode="numeric"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <FormInput control={control} name="budget_min" label={tCrm('criteria.budgetMin')} inputMode="decimal" />
          <FormInput control={control} name="budget_max" label={tCrm('criteria.budgetMax')} inputMode="decimal" />
        </div>
        <Controller
          control={control}
          name="seeking_property_types"
          render={({ field }) => {
            const selected = field.value ?? [];
            return (
              <div>
                <p id="criteria-types" className="mb-1.5 text-sm font-medium">{tCrm('criteria.propertyTypes')}</p>
                <div role="group" aria-labelledby="criteria-types" className="flex flex-wrap gap-2">
                  {seekingPropertyTypeValues.map((type) => {
                    const on = selected.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        aria-pressed={on}
                        onClick={() => field.onChange(on ? selected.filter((v) => v !== type) : [...selected, type])}
                        className={
                          'min-h-11 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring '
                          + (on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted')
                        }
                      >
                        {tPropertyType(type)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <FormInput
            control={control}
            name="seeking_cities"
            label={tCrm('criteria.cities')}
            placeholder={tCrm('criteria.citiesPlaceholder')}
          />
          <FormInput
            control={control}
            name="seeking_neighborhoods"
            label={tCrm('criteria.neighborhoods')}
            placeholder={tCrm('criteria.neighborhoodsPlaceholder')}
          />
        </div>
        <p className="text-xs text-muted-foreground">{tCrm('criteria.help')}</p>
      </fieldset>

      <div className={compact ? 'space-y-4' : 'rounded-xl bg-card p-6 space-y-4'}>
        {!compact ? (
          <h2 className="font-display text-base font-semibold tracking-tight text-foreground">{t('idSection')}</h2>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <FormSelect
            control={control}
            name="id_type"
            label={t('idType')}
            options={idTypeOptions}
            placeholder={t('idTypePlaceholder')}
          />
          <FormInput control={control} name="id_number" label={t('idNumber')} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              <span>{t('saving')}</span>
            </>
          ) : (
            <span>{mode === 'create' ? t('create') : tCommon('save')}</span>
          )}
        </Button>
        {!onSuccess ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            {tCommon('cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
