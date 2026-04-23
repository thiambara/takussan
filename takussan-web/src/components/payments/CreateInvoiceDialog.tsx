'use client';

import { useFieldArray } from 'react-hook-form';
import { useLocale } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  FormGlobalError,
  FormInput,
  FormSelect,
  FormTextarea,
} from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useCreateInvoice } from '@/lib/queries/payments';
import {
  createInvoiceSchema,
  type CreateInvoiceFormValues,
} from '@/lib/schemas/payment';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { CURRENCY_OPTIONS } from './constants';

interface CreateInvoiceDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (invoiceId: number) => void;
}

const INVOICEABLE_OPTIONS = [
  { value: '', label: 'Aucun' },
  { value: 'lease', label: 'Bail' },
  { value: 'booking', label: 'Réservation' },
];

const DEFAULT_VALUES: CreateInvoiceFormValues = {
  customer_id: 0,
  invoiceable_type: undefined,
  invoiceable_id: undefined,
  issue_date: new Date().toISOString().slice(0, 10),
  due_date: '',
  items: [{ description: '', quantity: 1, unit_price: 0 }],
  tax_rate: 0,
  currency: 'XOF',
  notes: '',
};

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateInvoiceDialogProps) {
  const locale = useLocale() as Locale;
  const createInvoice = useCreateInvoice();

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    CreateInvoiceFormValues,
    { id: number }
  >({
    schema: createInvoiceSchema,
    defaultValues: DEFAULT_VALUES,
    onSubmit: async (values) => {
      const subtotal = values.items.reduce(
        (sum, item) => sum + item.quantity * item.unit_price,
        0,
      );
      const res = await createInvoice.mutateAsync({
        customer_id: values.customer_id,
        invoiceable_type: values.invoiceable_type,
        invoiceable_id: values.invoiceable_id,
        issue_date: values.issue_date,
        due_date: values.due_date || undefined,
        subtotal,
        tax_rate: values.tax_rate || undefined,
        currency: values.currency,
        notes: values.notes || undefined,
      });
      return { id: res.data.id };
    },
    onSuccess: (result) => {
      form.reset(DEFAULT_VALUES);
      onOpenChange(false);
      if (onCreated && result?.id) onCreated(result.id);
    },
  });

  const items = form.watch('items');
  const taxRate = form.watch('tax_rate') ?? 0;
  const currency = form.watch('currency') ?? 'XOF';

  const subtotal = (items ?? []).reduce(
    (sum, item) => sum + (item?.quantity ?? 0) * (item?.unit_price ?? 0),
    0,
  );
  const taxAmount = Math.round((subtotal * (taxRate ?? 0)) / 100);
  const total = subtotal + taxAmount;

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset(DEFAULT_VALUES);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Générer une facture</DialogTitle>
          <DialogDescription>
            Sélectionnez un client, ajoutez des lignes et l&apos;échéance.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <FormGlobalError>{globalError}</FormGlobalError>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<CreateInvoiceFormValues>
              control={form.control}
              name="customer_id"
              type="number"
              label="ID client"
              required
              min={1}
            />
            <FormSelect<CreateInvoiceFormValues>
              control={form.control}
              name="currency"
              label="Devise"
              options={CURRENCY_OPTIONS.map((o) => ({ ...o }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect<CreateInvoiceFormValues>
              control={form.control}
              name="invoiceable_type"
              label="Lié à"
              options={INVOICEABLE_OPTIONS.map((o) => ({ ...o }))}
            />
            <FormInput<CreateInvoiceFormValues>
              control={form.control}
              name="invoiceable_id"
              type="number"
              label="ID (bail ou réservation)"
              min={1}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<CreateInvoiceFormValues>
              control={form.control}
              name="issue_date"
              type="date"
              label="Date d'émission"
              required
            />
            <FormInput<CreateInvoiceFormValues>
              control={form.control}
              name="due_date"
              type="date"
              label="Échéance"
            />
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-app-ink">Lignes</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  append({ description: '', quantity: 1, unit_price: 0 })
                }
              >
                <Plus className="mr-1 size-4" aria-hidden="true" />
                Ajouter
              </Button>
            </div>
            <ul className="space-y-2">
              {fields.map((field, index) => (
                <li
                  key={field.id}
                  className="grid grid-cols-1 items-start gap-2 rounded-lg border border-stone-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_110px_130px_40px]"
                >
                  <FormInput<CreateInvoiceFormValues>
                    control={form.control}
                    name={`items.${index}.description`}
                    placeholder="Description"
                  />
                  <FormInput<CreateInvoiceFormValues>
                    control={form.control}
                    name={`items.${index}.quantity`}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Qté"
                  />
                  <FormInput<CreateInvoiceFormValues>
                    control={form.control}
                    name={`items.${index}.unit_price`}
                    type="number"
                    min={0}
                    step={100}
                    placeholder="Prix unitaire"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                    aria-label="Supprimer la ligne"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<CreateInvoiceFormValues>
              control={form.control}
              name="tax_rate"
              type="number"
              min={0}
              max={100}
              step={0.5}
              label="TVA (%)"
            />
            <FormTextarea<CreateInvoiceFormValues>
              control={form.control}
              name="notes"
              label="Notes"
              rows={2}
            />
          </div>

          <dl className="grid gap-2 rounded-xl bg-app-surface-1 p-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-app-ink-muted">Sous-total</dt>
              <dd className="text-sm font-semibold text-app-ink">
                {formatCurrency(subtotal, locale, { currency })}
              </dd>
            </div>
            <div>
              <dt className="text-app-ink-muted">TVA</dt>
              <dd className="text-sm font-semibold text-app-ink">
                {formatCurrency(taxAmount, locale, { currency })}
              </dd>
            </div>
            <div>
              <dt className="text-app-ink-muted">Total</dt>
              <dd className="text-sm font-semibold text-app-ink">
                {formatCurrency(total, locale, { currency })}
              </dd>
            </div>
          </dl>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting || total <= 0}>
              {isSubmitting ? 'Création…' : 'Créer la facture'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
