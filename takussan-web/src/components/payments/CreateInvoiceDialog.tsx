'use client';

import { useEffect } from 'react';
import { useFieldArray, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'next-intl';
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
  FormDatePicker,
} from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useCreateInvoice } from '@/lib/queries/payments';
import {
  createInvoiceSchema,
  type CreateInvoiceFormValues,
} from '@/lib/schemas/payment';
import { formatCurrency } from '@/lib/format';
import { CURRENCY_METADATA, type CurrencyCode } from '@/lib/format/currency';
import { useAgencyInvoiceDefaults } from '@/hooks/useAgencyInvoiceDefaults';
import type { Locale } from '@/i18n/config';
import { CURRENCY_OPTIONS } from './constants';

interface CreateInvoiceDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (invoiceId: number) => void;
}

/** Les valeurs sont la donnée ; les libellés se résolvent au rendu (TCK-292). */
const INVOICEABLE_VALUES = [
  { value: '', labelKey: 'none' },
  { value: 'lease', labelKey: 'lease' },
  { value: 'booking', labelKey: 'booking' },
] as const;

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

/**
 * P133.01 (TCK-1413) — la TVA de l'aperçu s'arrondit à l'unité de la devise, comme
 * `Currency::roundAmount` côté API (`InvoiceService::create`) : 10,50 € à 18 % font 1,89 €, pas 2.
 */
function arrondiDevise(montant: number, devise: string): number {
  const decimales = CURRENCY_METADATA[devise as CurrencyCode]?.decimalPlaces ?? 0;
  // D'abord au dix-millième (deux facteurs à 2 décimales tiennent en 4, comme le `bcmul` de
  // l'API), pour que `1,005 × 100` ne tombe pas à `100,4999…` ; puis à l'unité de la devise.
  const dixMillionieme = Math.round(montant * 10_000);
  return Math.round(dixMillionieme / 10 ** (4 - decimales)) / 10 ** decimales;
}

/**
 * P133.02 (TCK-1377) — le sous-total de l'aperçu se compte comme l'API le recompte
 * (`InvoiceService::priceLines`) : chaque ligne arrondie à l'unité de la devise, puis la somme.
 */
function sousTotal(
  lignes: ReadonlyArray<{ quantity?: number; unit_price?: number } | undefined>,
  devise: string,
): number {
  return lignes.reduce(
    (somme, ligne) => somme + arrondiDevise((ligne?.quantity ?? 0) * (ligne?.unit_price ?? 0), devise),
    0,
  );
}

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateInvoiceDialogProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.invoiceDialog');
  const createInvoice = useCreateInvoice();
  // P133.01 (TCK-1413) — le taux de l'agence pré-remplit le champ : c'est celui que l'API prenait
  // en silence quand le dialogue n'envoyait rien.
  const agence = useAgencyInvoiceDefaults();
  const valeursInitiales: CreateInvoiceFormValues = agence.ready
    ? {
        ...DEFAULT_VALUES,
        tax_rate: agence.taxRate ?? 0,
        // P133.03 (TCK-1379) — la devise de l'agence (P04.09), modifiable.
        currency: agence.currency ?? DEFAULT_VALUES.currency,
      }
    : DEFAULT_VALUES;

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    CreateInvoiceFormValues,
    { id: number }
  >({
    schema: createInvoiceSchema,
    defaultValues: DEFAULT_VALUES,
    onSubmit: async (values) => {
      const res = await createInvoice.mutateAsync({
        customer_id: values.customer_id,
        invoiceable_type: values.invoiceable_type,
        invoiceable_id: values.invoiceable_id,
        issue_date: values.issue_date,
        due_date: values.due_date || undefined,
        // P133.02 (TCK-1377) — les lignes saisies, dont l'API recompte le sous-total et qu'elle
        // imprime ; le sous-total du navigateur ne part plus.
        items: values.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
        // P133.01 (TCK-1413) — le taux affiché part tel quel, `0` compris : `|| undefined` faisait
        // tomber le 0, et l'API appliquait alors `agencies.default_tax_rate`.
        tax_rate: values.tax_rate ?? 0,
        currency: values.currency,
        notes: values.notes || undefined,
      });
      return { id: res.data.id };
    },
    onSuccess: (result) => {
      form.reset(valeursInitiales);
      onOpenChange(false);
      if (onCreated && result?.id) onCreated(result.id);
    },
  });

  // TCK-571 — `useWatch`, jamais `form.watch()` lu pendant le rendu (cf. TCK-564). Compilé, ce
  // composant ne figeait pas ses totaux, mais par CHANCE : `onSuccess` ci-dessus capture `form`, et
  // le compilateur renonce alors à mettre en cache ce qui en dépend. Mesuré : retirer le
  // `form.reset` de `onSuccess` suffisait à figer le total d'une ligne ajoutée.
  const items = useWatch({ control: form.control, name: 'items' });
  const taxRate = useWatch({ control: form.control, name: 'tax_rate' }) ?? 0;
  const currency = useWatch({ control: form.control, name: 'currency' }) ?? 'XOF';

  const subtotal = sousTotal(items ?? [], currency);
  const taxAmount = arrondiDevise((subtotal * (taxRate ?? 0)) / 100, currency);
  const total = subtotal + taxAmount;

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  // Les réglages de l'agence arrivent après le premier rendu : ils remplacent la valeur initiale
  // tant que la personne n'a pas touché au champ.
  const tauxAgence = agence.ready ? (agence.taxRate ?? 0) : null;
  useEffect(() => {
    if (tauxAgence === null || form.getFieldState('tax_rate').isDirty) return;
    form.setValue('tax_rate', tauxAgence);
  }, [tauxAgence, form]);
  const deviseAgence = agence.ready ? agence.currency : null;
  useEffect(() => {
    if (deviseAgence === null || form.getFieldState('currency').isDirty) return;
    form.setValue('currency', deviseAgence);
  }, [deviseAgence, form]);

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset(valeursInitiales);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
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
              label={t('customerId')}
              required
              min={1}
            />
            <FormSelect<CreateInvoiceFormValues>
              control={form.control}
              name="currency"
              label={t('currency')}
              options={CURRENCY_OPTIONS.map((o) => ({ ...o }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormSelect<CreateInvoiceFormValues>
              control={form.control}
              name="invoiceable_type"
              label={t('linkedTo')}
              options={INVOICEABLE_VALUES.map((o) => ({
                value: o.value,
                label: t(`linked.${o.labelKey}`),
              }))}
            />
            <FormInput<CreateInvoiceFormValues>
              control={form.control}
              name="invoiceable_id"
              type="number"
              label={t('linkedId')}
              min={1}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormDatePicker<CreateInvoiceFormValues>
              control={form.control}
              name="issue_date"
              label={t('issueDate')}
              required
            />
            <FormDatePicker<CreateInvoiceFormValues>
              control={form.control}
              name="due_date"
              label={t('dueDate')}
            />
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t('lines')}</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  append({ description: '', quantity: 1, unit_price: 0 })
                }
              >
                <Plus className="mr-1 size-4" aria-hidden="true" />
                {t('addLine')}
              </Button>
            </div>
            <ul className="space-y-2">
              {fields.map((field, index) => (
                <li
                  key={field.id}
                  className="grid grid-cols-1 items-start gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[minmax(0,1fr)_110px_130px_40px]"
                >
                  <FormInput<CreateInvoiceFormValues>
                    control={form.control}
                    name={`items.${index}.description`}
                    placeholder={t('descriptionPlaceholder')}
                  />
                  <FormInput<CreateInvoiceFormValues>
                    control={form.control}
                    name={`items.${index}.quantity`}
                    type="number"
                    min={0}
                    step={1}
                    placeholder={t('quantityPlaceholder')}
                  />
                  <FormInput<CreateInvoiceFormValues>
                    control={form.control}
                    name={`items.${index}.unit_price`}
                    type="number"
                    min={0}
                    step="any"
                    placeholder={t('unitPricePlaceholder')}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                    aria-label={t('removeLine')}
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
              label={t('taxRate')}
            />
            <FormTextarea<CreateInvoiceFormValues>
              control={form.control}
              name="notes"
              label={t('notes')}
              rows={2}
            />
          </div>

          <dl className="grid gap-2 rounded-xl bg-card p-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{t('subtotal')}</dt>
              <dd className="text-sm font-semibold text-foreground">
                {formatCurrency(subtotal, locale, { currency })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('tax')}</dt>
              <dd className="text-sm font-semibold text-foreground">
                {formatCurrency(taxAmount, locale, { currency })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('total')}</dt>
              <dd className="text-sm font-semibold text-foreground">
                {formatCurrency(total, locale, { currency })}
              </dd>
            </div>
          </dl>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || total <= 0}>
              {isSubmitting ? t('creating') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
