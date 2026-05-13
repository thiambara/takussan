'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, type Control } from 'react-hook-form';
import { useApiForm } from '@/hooks/useApiForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FormInput,
  FormSelect,
  FormTextarea,
  FormGlobalError,
  FormDatePicker,
} from '@/components/forms';
import {
  useCreateLease,
  useLeaseCustomerOptions,
  useLeasePropertyOptions,
} from '@/lib/queries/leases';
import { createLeaseSchema, type CreateLeaseFormValues } from '@/lib/schemas/lease';
import { useAuth } from '@/context/AuthContext';
import { formatCurrency } from '@/lib/format';
import type { CustomerListItem } from '@/types/customer';
import type { PropertyListItem } from '@/types/property';

const LEASE_TYPE_OPTIONS = [
  { value: 'residential_rent', label: 'Location résidentielle' },
  { value: 'commercial_rent', label: 'Location commerciale' },
  { value: 'seasonal_rent', label: 'Location saisonnière' },
  { value: 'sale', label: 'Vente' },
];

const PAYMENT_FREQUENCY_OPTIONS = [
  { value: 'monthly', label: 'Mensuel' },
  { value: 'quarterly', label: 'Trimestriel' },
  { value: 'yearly', label: 'Annuel' },
];

// TCK-084 — share the centralised currency catalogue.
import { CURRENCY_METADATA } from '@/lib/format/currency';

const CURRENCY_OPTIONS = (['XOF', 'EUR', 'USD', 'XAF'] as const).map((code) => ({
  value: code,
  label: `${code} (${CURRENCY_METADATA[code].symbol})`,
}));

export function CreateLeaseForm() {
  const router = useRouter();
  const createLease = useCreateLease();
  const { user } = useAuth();
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
      landlord_id: 0,
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
    },
    onSubmit: async (values) => {
      const result = await createLease.mutateAsync(values);
      return result;
    },
    onSuccess: (result) => {
      router.push(`/app/leases/${result.data.id}`);
    },
  });

  const type = form.watch('type');
  const isSale = type === 'sale';
  const selectedPropertyId = form.watch('property_id');
  const selectedTenantId = form.watch('tenant_id');
  const properties = useMemo(() => propertiesQuery.data?.data ?? [], [propertiesQuery.data]);
  const customers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) ?? null;
  const selectedCustomer = customers.find((c) => c.id === selectedTenantId) ?? null;

  useEffect(() => {
    if (user?.id && form.getValues('landlord_id') !== user.id) {
      form.setValue('landlord_id', user.id, { shouldDirty: false, shouldValidate: true });
    }
  }, [form, user?.id]);

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-6"
    >
      <FormGlobalError>{globalError}</FormGlobalError>

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Parties</h2>
        <input type="hidden" {...form.register('landlord_id', { valueAsNumber: true })} />
        <div className="grid gap-4 lg:grid-cols-2">
          <EntitySelect
            control={form.control}
            name="property_id"
            label="Bien"
            placeholder={propertiesQuery.isLoading ? 'Chargement des biens…' : 'Sélectionner un bien'}
            options={properties.map((property) => ({
              value: property.id,
              label: formatPropertyLabel(property),
            }))}
            required
          />
          <div className="space-y-2">
            <label htmlFor="tenant-search" className="block text-sm font-medium">
              Locataire
              <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
            </label>
            <Input
              id="tenant-search"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Rechercher par nom, email ou téléphone"
            />
            <EntitySelect
              control={form.control}
              name="tenant_id"
              label={null}
              placeholder={customersQuery.isLoading ? 'Recherche…' : 'Sélectionner un locataire'}
              options={customers.map((customer) => ({
                value: customer.id,
                label: formatCustomerLabel(customer),
              }))}
              required
            />
          </div>
        </div>
        <div className="grid gap-3 rounded-lg bg-stone-50 p-4 text-sm sm:grid-cols-2">
          <SummaryBlock
            label="Bien sélectionné"
            value={
              selectedProperty
                ? `${selectedProperty.title} · ${selectedProperty.reference_number ?? `#${selectedProperty.id}`}`
                : 'Aucun bien sélectionné'
            }
            detail={
              selectedProperty && typeof selectedProperty.price === 'number'
                ? formatCurrency(selectedProperty.price, 'fr', { currency: selectedProperty.currency ?? 'XOF' })
                : undefined
            }
          />
          <SummaryBlock
            label="Locataire sélectionné"
            value={selectedCustomer ? formatCustomerLabel(selectedCustomer) : 'Aucun locataire sélectionné'}
            detail={user ? `Bailleur actif : ${user.full_name}` : 'Bailleur actif en cours de chargement'}
          />
        </div>
        <div className="rounded-lg border border-dashed border-stone-200 p-3 text-xs text-stone-500">
          Les garants pourront être ajoutés sur la fiche du bail une fois le brouillon créé.
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Conditions financières</h2>
        <FormSelect<CreateLeaseFormValues>
          control={form.control}
          name="type"
          label="Type de contrat"
          options={LEASE_TYPE_OPTIONS}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormDatePicker<CreateLeaseFormValues>
            control={form.control}
            name="start_date"
            label="Date de début"
            required
          />
          <FormDatePicker<CreateLeaseFormValues>
            control={form.control}
            name="end_date"
            label="Date de fin (optionnel)"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {isSale ? (
            <FormInput<CreateLeaseFormValues>
              control={form.control}
              name="sale_price"
              type="number"
              label="Prix de vente"
              required
              min={0}
              step={1000}
            />
          ) : (
            <FormInput<CreateLeaseFormValues>
              control={form.control}
              name="monthly_rent"
              type="number"
              label="Loyer mensuel"
              required
              min={0}
              step={1000}
            />
          )}
          <FormInput<CreateLeaseFormValues>
            control={form.control}
            name="deposit_amount"
            type="number"
            label="Caution"
            required
            min={0}
            step={1000}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormSelect<CreateLeaseFormValues>
            control={form.control}
            name="currency"
            label="Devise"
            options={CURRENCY_OPTIONS}
          />
          <FormSelect<CreateLeaseFormValues>
            control={form.control}
            name="payment_frequency"
            label="Fréquence"
            options={PAYMENT_FREQUENCY_OPTIONS}
          />
          <FormInput<CreateLeaseFormValues>
            control={form.control}
            name="payment_day"
            type="number"
            label="Jour du paiement"
            min={1}
            max={28}
          />
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Clauses</h2>
        <FormTextarea<CreateLeaseFormValues>
          control={form.control}
          name="terms"
          label="Conditions générales"
          rows={4}
        />
        <FormTextarea<CreateLeaseFormValues>
          control={form.control}
          name="special_conditions"
          label="Conditions particulières"
          rows={3}
        />
      </section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Annuler
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Création…' : 'Créer le bail'}
        </Button>
      </div>
    </form>
  );
}

type EntityOption = { value: number; label: string };

function EntitySelect({
  control,
  name,
  label,
  placeholder,
  options,
  required,
}: {
  control: Control<CreateLeaseFormValues>;
  name: 'property_id' | 'tenant_id';
  label: string | null;
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
            <SelectTrigger id={id} className="w-full" aria-invalid={Boolean(fieldState.error) || undefined}>
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
            <p className="mt-1 text-xs text-destructive">{fieldState.error.message}</p>
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
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 font-medium text-stone-900">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-stone-500">{detail}</p> : null}
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

function formatCustomerLabel(customer: CustomerListItem): string {
  const name =
    customer.full_name ||
    [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() ||
    `Customer #${customer.id}`;
  const contact = [customer.email, customer.phone].filter(Boolean).join(' · ');
  return contact ? `${name} · ${contact}` : name;
}
