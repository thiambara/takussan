'use client';

import { useRouter } from 'next/navigation';
import { useApiForm } from '@/hooks/useApiForm';
import { Button } from '@/components/ui/button';
import {
  FormInput,
  FormSelect,
  FormTextarea,
  FormGlobalError,
} from '@/components/forms';
import { useCreateLease } from '@/lib/queries/leases';
import { createLeaseSchema, type CreateLeaseFormValues } from '@/lib/schemas/lease';

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

const CURRENCY_OPTIONS = [
  { value: 'XOF', label: 'XOF (FCFA)' },
  { value: 'XAF', label: 'XAF' },
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
];

export function CreateLeaseForm() {
  const router = useRouter();
  const createLease = useCreateLease();

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
        <div className="grid gap-4 sm:grid-cols-3">
          <FormInput<CreateLeaseFormValues>
            control={form.control}
            name="property_id"
            type="number"
            label="Bien (ID)"
            required
          />
          <FormInput<CreateLeaseFormValues>
            control={form.control}
            name="landlord_id"
            type="number"
            label="Bailleur (ID)"
            required
          />
          <FormInput<CreateLeaseFormValues>
            control={form.control}
            name="tenant_id"
            type="number"
            label="Locataire (ID)"
            required
          />
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
          <FormInput<CreateLeaseFormValues>
            control={form.control}
            name="start_date"
            type="date"
            label="Date de début"
            required
          />
          <FormInput<CreateLeaseFormValues>
            control={form.control}
            name="end_date"
            type="date"
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
