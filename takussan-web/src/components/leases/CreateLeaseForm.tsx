'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller, useFormState, useWatch, type Control } from 'react-hook-form';
import { useApiForm } from '@/hooks/useApiForm';
import { useAvertissementDepart } from '@/hooks/useAvertissementDepart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/feedback';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormAmountInput,
  FormInput,
  FormSelect,
  FormTextarea,
  FormGlobalError,
} from '@/components/forms';
import { FormDatePicker } from '@/components/forms/FormDatePicker';
import {
  useCreateLease,
  useLeaseCustomerOptions,
  useLeasePropertyOptions,
} from '@/lib/queries/leases';
import { useBooking } from '@/lib/queries/bookings';
import { createLeaseSchema, type CreateLeaseFormValues } from '@/lib/schemas/lease';
import { formatCurrency } from '@/lib/format';
import { nomAffichable } from '@/lib/identite';
import type { Booking } from '@/types/booking';
import type { CustomerListItem } from '@/types/customer';
import type { PropertyListItem } from '@/types/property';

/**
 * ⚠ Ce formulaire emploie un VOCABULAIRE DIFFÉRENT de `LeaseDetail` pour le même enum
 * (« Location résidentielle » ici, « Bail d'habitation » là-bas). TCK-292 ne change AUCUN rendu :
 * les deux tables sont donc conservées telles quelles, sous `lease.form.typeOptions.*` et
 * `lease.types.*`. Les fusionner est une décision produit, pas un arbitrage de ce ticket.
 */
const LEASE_TYPES = ['residential_rent', 'commercial_rent', 'seasonal_rent', 'sale'] as const;

const PAYMENT_FREQUENCIES = ['monthly', 'quarterly', 'yearly'] as const;

// TCK-084 — share the centralised currency catalogue.
import { CURRENCY_METADATA } from '@/lib/format/currency';

const CURRENCY_OPTIONS = (['XOF', 'EUR', 'USD', 'XAF'] as const).map((code) => ({
  value: code,
  label: `${code} (${CURRENCY_METADATA[code].symbol})`,
}));

const DEVISES = ['XOF', 'XAF', 'EUR', 'USD'] as const;

interface CreateLeaseFormProps {
  /**
   * P48.03 (TCK-2352) — `/app/leases/new?booking_id=…` : le bail tiré d'une candidature. Le bien,
   * le locataire (le client de la réservation), les dates et le loyer se préremplissent, et
   * `booking_id` part avec le bail : l'API refuse un autre locataire, et passe la réservation à
   * `completed`, ce qui libère ses nuits.
   */
  readonly bookingId?: number;
}

export function CreateLeaseForm({ bookingId }: CreateLeaseFormProps = {}) {
  if (bookingId) {
    return <CreateLeaseFormDepuisReservation bookingId={bookingId} />;
  }
  return <FormulaireDuBail reservation={null} />;
}

/** `useBooking` ne s'appelle que sur ce chemin : le formulaire vierge ne lit aucune réservation. */
function CreateLeaseFormDepuisReservation({ bookingId }: { readonly bookingId: number }) {
  const t = useTranslations('lease.form');
  const query = useBooking(bookingId);
  if (query.isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }
  const reservation = query.data?.data;
  if (query.isError || !reservation) {
    return <ErrorState message={t('fromBookingError')} />;
  }
  return <FormulaireDuBail reservation={reservation} />;
}

function valeursDeLaReservation(reservation: Booking): Partial<CreateLeaseFormValues> {
  const bien = reservation.property;
  const devise = DEVISES.find((code) => code === bien?.currency);
  return {
    property_id: reservation.property_id,
    tenant_id: reservation.customer_id,
    booking_id: reservation.id,
    start_date: reservation.start_date?.slice(0, 10) ?? '',
    end_date: reservation.end_date?.slice(0, 10) ?? '',
    ...(bien?.contract_type === 'rent' && typeof bien.price === 'number' ? { monthly_rent: bien.price } : {}),
    ...(devise ? { currency: devise } : {}),
  };
}

function FormulaireDuBail({ reservation }: { readonly reservation: Booking | null }) {
  const t = useTranslations('lease.form');
  const tLease = useTranslations('lease');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const createLease = useCreateLease();
  const [customerSearch, setCustomerSearch] = useState('');
  const propertiesQuery = useLeasePropertyOptions();
  const customersQuery = useLeaseCustomerOptions(customerSearch);

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    CreateLeaseFormValues,
    { data: { id: number } }
  >({
    schema: createLeaseSchema,
    defaultValues: {
      property_id: 0,
      tenant_id: 0,
      type: 'residential_rent',
      start_date: '',
      end_date: '',
      monthly_rent: 0,
      deposit_amount: 0,
      currency: 'XOF',
      payment_frequency: 'monthly',
      payment_day: 1,
      terms: '',
      special_conditions: '',
      ...(reservation ? valeursDeLaReservation(reservation) : {}),
    },
    onSubmit: async (values) => {
      const result = await createLease.mutateAsync(values);
      return result;
    },
    onSuccess: (result) => {
      router.push(`/app/leases/${result.data.id}`);
    },
  });

  // P08.06 (TCK-755) — avertir avant de quitter la page, seulement quand le formulaire est modifié.
  // `useFormState` et non `form.formState` lu au rendu : compilé, la lecture resterait figée (TCK-571).
  const { isDirty } = useFormState({ control: form.control });
  useAvertissementDepart(isDirty);

  const customerLabel = (customer: CustomerListItem) =>
    formatCustomerLabel(customer, (id) => t('customerFallback', { id: String(id) }));

  const leaseTypeOptions = LEASE_TYPES.map((value) => ({
    value,
    label: t(`typeOptions.${value}`),
  }));
  const paymentFrequencyOptions = PAYMENT_FREQUENCIES.map((value) => ({
    value,
    label: t(`frequencyOptions.${value}`),
  }));

  // TCK-571 — `useWatch`, jamais `form.watch()` lu pendant le rendu. Compilé, `form.watch('type')`
  // était mis en cache sur l'identité — stable — de `form` : un bail passé en « Vente » gardait le
  // champ « Loyer mensuel », et le récapitulatif ne nommait jamais le bien choisi (TCK-564).
  const type = useWatch({ control: form.control, name: 'type' });
  const isSale = type === 'sale';
  const selectedPropertyId = useWatch({ control: form.control, name: 'property_id' });
  const selectedTenantId = useWatch({ control: form.control, name: 'tenant_id' });
  // TCK-913 — la devise décide des décimales admises par `FormAmountInput`.
  const currency = useWatch({ control: form.control, name: 'currency' });
  const properties = useMemo(() => propertiesQuery.data?.data ?? [], [propertiesQuery.data]);
  const customers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);
  const aucunBien = !propertiesQuery.isLoading && properties.length === 0;
  const aucunLocataire = !customersQuery.isLoading && customers.length === 0;
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) ?? null;
  const selectedCustomer = customers.find((c) => c.id === selectedTenantId) ?? null;

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-6"
    >
      <FormGlobalError>{globalError}</FormGlobalError>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('parties')}</h2>
        {reservation ? (
          <PartiesDeLaReservation
            reservation={reservation}
            titulaire={properties.find((p) => p.id === reservation.property_id)?.owner ?? null}
          />
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <EntitySelect
                control={form.control}
                name="property_id"
                label={t('property')}
                placeholder={propertiesQuery.isLoading ? t('loadingProperties') : t('selectProperty')}
                options={properties.map((property) => ({
                  value: property.id,
                  label: formatPropertyLabel(property),
                }))}
                required
              />
              <div className="space-y-2">
                <label htmlFor="tenant-search" className="block text-sm font-medium">
                  {t('tenant')}
                  <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
                </label>
                <Input
                  id="tenant-search"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder={t('tenantSearchPlaceholder')}
                />
                <EntitySelect
                  control={form.control}
                  name="tenant_id"
                  label={null}
                  ariaLabel={t('tenant')}
                  placeholder={customersQuery.isLoading ? t('searching') : t('selectTenant')}
                  options={customers.map((customer) => ({
                    value: customer.id,
                    label: customerLabel(customer),
                  }))}
                  required
                />
              </div>
            </div>
            {aucunBien || aucunLocataire ? (
              // TCK-776 (P15.09) — une liste vide se dit, et mène à ce qui la remplit.
              <div className="space-y-2 rounded-lg border border-dashed border-border p-4 text-sm">
                {aucunBien ? <p className="text-muted-foreground">{t('emptyProperties')}</p> : null}
                {aucunLocataire ? <p className="text-muted-foreground">{t('emptyTenants')}</p> : null}
                <div className="flex flex-wrap gap-3">
                  {aucunBien ? (
                    <Link href="/app/properties/new" className="font-medium text-primary underline-offset-4 hover:underline">
                      {t('createProperty')}
                    </Link>
                  ) : null}
                  {aucunLocataire ? (
                    <Link href="/app/customers/new" className="font-medium text-primary underline-offset-4 hover:underline">
                      {t('addTenant')}
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2">
              <SummaryBlock
                label={t('selectedProperty')}
                value={
                  selectedProperty
                    ? `${selectedProperty.title} · ${selectedProperty.reference_number ?? `#${selectedProperty.id}`}`
                    : t('noPropertySelected')
                }
                detail={
                  selectedProperty && typeof selectedProperty.price === 'number'
                    ? formatCurrency(selectedProperty.price, 'fr', { currency: selectedProperty.currency ?? 'XOF' })
                    : undefined
                }
              />
              <SummaryBlock
                label={t('selectedTenant')}
                value={selectedCustomer ? customerLabel(selectedCustomer) : t('noTenantSelected')}
                detail={
                  // TCK-997 (P50.01) — le bail naît au nom du TITULAIRE du bien (`LeaseService::create`,
                  // `landlord_id = property.user_id`), jamais de qui le saisit : la ligne le nomme.
                  selectedProperty?.owner
                    ? t('landlordOfProperty', {
                        name: nomAffichable({ id: selectedProperty.owner.id }, selectedProperty.owner.name),
                      })
                    : t('landlordPending')
                }
              />
            </div>
          </>
        )}
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          {t('guarantorsHint')}
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('financialTerms')}</h2>
        <FormSelect<CreateLeaseFormValues>
          control={form.control}
          name="type"
          label={t('contractType')}
          options={leaseTypeOptions}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormDatePicker<CreateLeaseFormValues>
            control={form.control}
            name="start_date"
            label={t('startDate')}
            required
          />
          <FormDatePicker<CreateLeaseFormValues>
            control={form.control}
            name="end_date"
            label={t('endDate')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {isSale ? (
            <FormAmountInput<CreateLeaseFormValues>
              control={form.control}
              name="sale_price"
              label={t('salePrice')}
              currency={currency}
              required
            />
          ) : (
            <FormAmountInput<CreateLeaseFormValues>
              control={form.control}
              name="monthly_rent"
              label={t('monthlyRent')}
              currency={currency}
              required
            />
          )}
          <FormAmountInput<CreateLeaseFormValues>
            control={form.control}
            name="deposit_amount"
            label={t('deposit')}
            currency={currency}
            required
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormSelect<CreateLeaseFormValues>
            control={form.control}
            name="currency"
            label={t('currency')}
            options={CURRENCY_OPTIONS}
          />
          <FormSelect<CreateLeaseFormValues>
            control={form.control}
            name="payment_frequency"
            label={t('frequency')}
            options={paymentFrequencyOptions}
          />
          <FormInput<CreateLeaseFormValues>
            control={form.control}
            name="payment_day"
            type="number"
            inputMode="numeric"
            label={t('paymentDay')}
            min={1}
            max={28}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">{t('clauses')}</h2>
        <FormTextarea<CreateLeaseFormValues>
          control={form.control}
          name="terms"
          label={tLease('terms')}
          rows={4}
        />
        <FormTextarea<CreateLeaseFormValues>
          control={form.control}
          name="special_conditions"
          label={tLease('specialConditions')}
          rows={3}
        />
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {tCommon('actions.cancel')}
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('creating') : t('submit')}
        </Button>
      </div>
    </form>
  );
}

/**
 * `titulaire` vient des options de bien du formulaire (`include=owner`, TCK-997) : la lecture de la
 * réservation ne charge pas le titulaire du bien, et le bail naît à son nom, pas à celui de qui le
 * saisit. Un bien hors de ces options laisse la ligne en attente, comme le formulaire vierge.
 */
function PartiesDeLaReservation({
  reservation,
  titulaire,
}: {
  readonly reservation: Booking;
  readonly titulaire: PropertyListItem['owner'] | null;
}) {
  const t = useTranslations('lease.form');
  const bien = reservation.property;
  const client = reservation.customer;
  return (
    <>
      <p className="text-sm text-foreground">
        {t('fromBooking', { reference: reservation.reference_number ?? `#${reservation.id}` })}
      </p>
      <div className="grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2">
        <SummaryBlock
          label={t('selectedProperty')}
          value={bien?.title ?? `#${reservation.property_id}`}
          detail={
            bien && typeof bien.price === 'number'
              ? formatCurrency(bien.price, 'fr', { currency: bien.currency ?? 'XOF' })
              : undefined
          }
        />
        <SummaryBlock
          label={t('selectedTenant')}
          value={nomAffichable(
            { id: reservation.customer_id, first_name: client?.first_name, last_name: client?.last_name },
            t('customerFallback', { id: String(reservation.customer_id) }),
          )}
          detail={
            titulaire
              ? t('landlordOfProperty', { name: nomAffichable({ id: titulaire.id }, titulaire.name) })
              : t('landlordPending')
          }
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('fromBookingHint')}</p>
    </>
  );
}

type EntityOption = { value: number; label: string };

function EntitySelect({
  control,
  name,
  label,
  ariaLabel,
  placeholder,
  options,
  required,
}: {
  control: Control<CreateLeaseFormValues>;
  name: 'property_id' | 'tenant_id';
  label: string | null;
  /**
   * Nom accessible du déclencheur quand `label` est `null` : sans lui, le choix n'a aucun nom
   * (TCK-1030, axe `button-name`).
   */
  ariaLabel?: string;
  placeholder: string;
  options: readonly EntityOption[];
  required?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="w-full">
          {label ? (
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
              {label}
              {required ? <span aria-hidden="true" className="ml-0.5 text-destructive">*</span> : null}
            </label>
          ) : null}
          <Select
            value={field.value ? String(field.value) : ''}
            onValueChange={(value) => field.onChange(Number(value))}
            items={options.map((option) => ({
              value: String(option.value),
              label: option.label,
            }))}
          >
            <SelectTrigger
              id={id}
              className="w-full"
              aria-label={label ? undefined : ariaLabel}
              aria-invalid={Boolean(fieldState.error) || undefined}
              aria-describedby={fieldState.error ? `${id}-error` : undefined}
            >
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fieldState.error ? (
            <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-destructive">
              {fieldState.error.message}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}

function SummaryBlock({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function formatPropertyLabel(property: PropertyListItem): string {
  const ref = property.reference_number ? `${property.reference_number} · ` : '';
  const price =
    typeof property.price === 'number'
      ? ` · ${formatCurrency(property.price, 'fr', { currency: property.currency ?? 'XOF' })}`
      : '';
  return `${ref}${property.title}${price}`;
}

/**
 * ⚠ Le repli `Customer #<id>` était ANGLAIS en dur dans l'interface française. TCK-292 ne change
 * aucun rendu : la valeur `fr` du dictionnaire le reproduit au caractère près. Le corriger en
 * « Client #… » est une décision produit, pas un effet de bord de ce ticket.
 */
function formatCustomerLabel(
  customer: CustomerListItem,
  fallback: (id: number) => string,
): string {
  // P220.03 (TCK-2281) — le nom seul : le contact suit déjà, il ne se répète pas en repli.
  const name =
    customer.full_name ||
    nomAffichable({ id: customer.id, first_name: customer.first_name, last_name: customer.last_name }, fallback(customer.id));
  const contact = [customer.email, customer.phone].filter(Boolean).join(' · ');
  return contact ? `${name} · ${contact}` : name;
}
