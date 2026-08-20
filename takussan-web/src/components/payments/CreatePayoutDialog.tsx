'use client';

import { useEffect, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';

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
import { useCreatePayout } from '@/lib/queries/payments';
import {
  createPayoutSchema,
  type CreatePayoutFormValues,
} from '@/lib/schemas/payment';
import { formatCurrency } from '@/lib/format';
import type { Locale } from '@/i18n/config';

import {
  CURRENCY_OPTIONS,
  PAYMENT_METHOD_VALUES,
  commissionFromRate,
  computePayoutNet,
} from './constants';

interface CreatePayoutDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (payoutId: number) => void;
  /**
   * Agency commission rate stored in `agencies.commission_rate` (percentage,
   * 0-100). Pre-fills `commission_rate` and drives the automatic commission
   * calculation — TCK-063 AC4.
   */
  readonly defaultCommissionRate?: number;
}

const DEFAULT_VALUES_BASE: Omit<CreatePayoutFormValues, 'commission_rate'> = {
  landlord_id: 0,
  lease_id: undefined,
  booking_id: undefined,
  period_start: '',
  period_end: '',
  gross_amount: 0,
  commission_amount: 0,
  fees_amount: 0,
  currency: 'XOF',
  payment_method: undefined,
  scheduled_at: '',
  notes: '',
};

export function CreatePayoutDialog({
  open,
  onOpenChange,
  onCreated,
  defaultCommissionRate,
}: CreatePayoutDialogProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.payoutDialog');
  const tMethod = useTranslations('payments.methods');
  const createPayout = useCreatePayout();

  const defaultValues: CreatePayoutFormValues = useMemo(
    () => ({
      ...DEFAULT_VALUES_BASE,
      commission_rate: defaultCommissionRate ?? 0,
    }),
    [defaultCommissionRate],
  );

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    CreatePayoutFormValues,
    { id: number }
  >({
    schema: createPayoutSchema,
    defaultValues,
    onSubmit: async (values) => {
      const res = await createPayout.mutateAsync({
        landlord_id: values.landlord_id,
        lease_id: values.lease_id,
        booking_id: values.booking_id,
        period_start: values.period_start || undefined,
        period_end: values.period_end || undefined,
        gross_amount: values.gross_amount,
        commission_amount: values.commission_amount,
        fees_amount: values.fees_amount,
        currency: values.currency,
        payment_method: values.payment_method,
        scheduled_at: values.scheduled_at || undefined,
        notes: values.notes || undefined,
      });
      return { id: res.data.id };
    },
    onSuccess: (result) => {
      form.reset(defaultValues);
      onOpenChange(false);
      if (onCreated && result?.id) onCreated(result.id);
    },
  });

  const gross = form.watch('gross_amount') ?? 0;
  const rate = form.watch('commission_rate') ?? 0;
  const manualCommission = form.watch('commission_amount');
  const fees = form.watch('fees_amount') ?? 0;
  const currency = form.watch('currency') ?? 'XOF';

  // Auto-sync commission_amount with rate × gross whenever the user touches
  // the rate or the gross amount (but allow them to override manually).
  useEffect(() => {
    if (!Number.isFinite(gross) || !Number.isFinite(rate)) return;
    const computed = commissionFromRate(gross, rate);
    if (computed !== manualCommission) {
      form.setValue('commission_amount', computed, { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gross, rate]);

  // Pas de `useMemo` ici, et pas d'oubli : le React Compiler mémoïse ce calcul (ADR-0015).
  // Le `useMemo` qui s'y trouvait faisait ABANDONNER la compilation de tout ce composant —
  // `react-hooks/preserve-manual-memoization` le signalait, et son correctif est de retirer la
  // mémoïsation manuelle, pas de l'ajuster.
  const net = computePayoutNet({
    gross: gross,
    commission: manualCommission ?? 0,
    fees,
  });

  useEffect(() => {
    if (!open) form.reset(defaultValues);
  }, [open, form, defaultValues]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <FormInput<CreatePayoutFormValues>
              control={form.control}
              name="landlord_id"
              type="number"
              label={t('landlordId')}
              required
              min={1}
            />
            <FormSelect<CreatePayoutFormValues>
              control={form.control}
              name="currency"
              label={t('currency')}
              options={CURRENCY_OPTIONS.map((o) => ({ ...o }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<CreatePayoutFormValues>
              control={form.control}
              name="lease_id"
              type="number"
              label={t('leaseId')}
              min={1}
            />
            <FormInput<CreatePayoutFormValues>
              control={form.control}
              name="booking_id"
              type="number"
              label={t('bookingId')}
              min={1}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormDatePicker<CreatePayoutFormValues>
              control={form.control}
              name="period_start"
              label={t('periodStart')}
            />
            <FormDatePicker<CreatePayoutFormValues>
              control={form.control}
              name="period_end"
              label={t('periodEnd')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormInput<CreatePayoutFormValues>
              control={form.control}
              name="gross_amount"
              type="number"
              min={0}
              step={100}
              label={t('grossAmount')}
              required
            />
            <FormInput<CreatePayoutFormValues>
              control={form.control}
              name="commission_rate"
              type="number"
              min={0}
              max={100}
              step={0.1}
              label={t('commissionRate')}
            />
            <FormInput<CreatePayoutFormValues>
              control={form.control}
              name="commission_amount"
              type="number"
              min={0}
              step={100}
              label={t('commission')}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormInput<CreatePayoutFormValues>
              control={form.control}
              name="fees_amount"
              type="number"
              min={0}
              step={100}
              label={t('fees')}
            />
            <FormSelect<CreatePayoutFormValues>
              control={form.control}
              name="payment_method"
              label={t('method')}
              options={[
                { value: '', label: tMethod('none') },
                ...PAYMENT_METHOD_VALUES.map((value) => ({
                  value,
                  label: tMethod(value),
                })),
              ]}
            />
            <FormDatePicker<CreatePayoutFormValues>
              control={form.control}
              name="scheduled_at"
              label={t('scheduledAt')}
            />
          </div>

          <FormTextarea<CreatePayoutFormValues>
            control={form.control}
            name="notes"
            label={t('notes')}
            rows={2}
          />

          <dl className="grid gap-2 rounded-xl bg-app-surface-1 p-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-app-ink-muted">{t('gross')}</dt>
              <dd className="text-sm font-semibold text-app-ink">
                {formatCurrency(gross, locale, { currency })}
              </dd>
            </div>
            <div>
              <dt className="text-app-ink-muted">{t('commission')}</dt>
              <dd className="text-sm font-semibold text-app-ink">
                {formatCurrency(manualCommission ?? 0, locale, { currency })}
              </dd>
            </div>
            <div>
              <dt className="text-app-ink-muted">{t('fees')}</dt>
              <dd className="text-sm font-semibold text-app-ink">
                {formatCurrency(fees, locale, { currency })}
              </dd>
            </div>
            <div>
              <dt className="text-app-ink-muted">{t('net')}</dt>
              <dd
                className={`text-sm font-semibold ${
                  net <= 0 ? 'text-destructive' : 'text-app-ink'
                }`}
              >
                {formatCurrency(net, locale, { currency })}
              </dd>
            </div>
          </dl>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || net <= 0}>
              {isSubmitting ? t('creating') : t('submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
