'use client';

import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  FormGlobalError,
  FormInput,
  FormSelect,
} from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { ApiError } from '@/lib/api';
import {
  customerFormSchema,
  normaliseCustomerForm,
  type CustomerFormValues,
} from '@/lib/schemas/customer';
import {
  createCustomerAction,
  updateCustomerAction,
} from '@/app/actions/dashboard-customers';
import type { CustomerDetail } from '@/types/customer';

import {
  CUSTOMER_STATUS_OPTIONS,
  ID_TYPE_OPTIONS,
  PIPELINE_STAGE_OPTIONS,
} from './options';

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
    };
  }
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
  };
}

export function CustomerForm({
  mode,
  customer,
  onSuccess,
  compact,
}: CustomerFormProps) {
  const router = useRouter();

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } =
    useApiForm<CustomerFormValues, CustomerDetail>({
      schema: customerFormSchema,
      defaultValues: toDefaults(customer),
      onSubmit: async (values) => {
        const payload = normaliseCustomerForm(values);
        const result =
          mode === 'edit' && customer
            ? await updateCustomerAction(customer.id, payload)
            : await createCustomerAction(payload);
        if (!result.ok) {
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <FormGlobalError>
        {globalError ? (
          <span className="flex items-center justify-between gap-4">
            <span>{globalError}</span>
            <button type="button" onClick={clearGlobalError} className="text-xs underline">
              Fermer
            </button>
          </span>
        ) : null}
      </FormGlobalError>

      <div className={compact ? 'space-y-4' : 'rounded-xl bg-app-surface-1 p-6 space-y-4'}>
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput control={control} name="first_name" label="Prénom" required />
          <FormInput control={control} name="last_name" label="Nom" required />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput
            control={control}
            name="email"
            label="E-mail"
            type="email"
            autoComplete="email"
          />
          <FormInput
            control={control}
            name="phone"
            label="Téléphone"
            type="tel"
            autoComplete="tel"
            placeholder="+221 77 123 45 67"
          />
        </div>
        <FormInput
          control={control}
          name="occupation"
          label="Profession"
          placeholder="Enseignant, commerçant, etc."
        />
      </div>

      <div className={compact ? 'space-y-4' : 'rounded-xl bg-app-surface-1 p-6 space-y-4'}>
        {!compact ? (
          <h2 className="text-base font-semibold text-app-ink">Suivi CRM</h2>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <FormSelect
            control={control}
            name="pipeline_stage"
            label="Étape du pipeline"
            options={PIPELINE_STAGE_OPTIONS}
          />
          <FormSelect
            control={control}
            name="status"
            label="Statut"
            options={CUSTOMER_STATUS_OPTIONS}
          />
        </div>
      </div>

      <div className={compact ? 'space-y-4' : 'rounded-xl bg-app-surface-1 p-6 space-y-4'}>
        {!compact ? (
          <h2 className="text-base font-semibold text-app-ink">Pièce d&apos;identité</h2>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <FormSelect
            control={control}
            name="id_type"
            label="Type de pièce"
            options={ID_TYPE_OPTIONS}
            placeholder="Non renseigné"
          />
          <FormInput control={control} name="id_number" label="Numéro" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              <span>Enregistrement…</span>
            </>
          ) : (
            <span>{mode === 'create' ? 'Créer le client' : 'Enregistrer'}</span>
          )}
        </Button>
        {!onSuccess ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
        ) : null}
      </div>
    </form>
  );
}
