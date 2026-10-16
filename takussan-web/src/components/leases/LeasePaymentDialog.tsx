'use client';

import { useLocale, useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormInput, FormSelect, FormGlobalError, FormDatePicker } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useLeasePayments, useMarkLeasePaymentPaid } from '@/lib/queries/leases';
import { leasePaymentSchema, type LeasePaymentFormValues } from '@/lib/schemas/lease';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';

interface LeasePaymentDialogProps {
  readonly leaseId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** Les valeurs d'enum du backend ; les libellés vivent sous `lease.payment.methods.*`. */
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'mobile_money', 'check', 'card'] as const;

/**
 * TCK-681 (P13.01) — « Enregistrer un paiement reçu » RÈGLE l'échéance choisie, par `mark-paid`.
 *
 * Le dialogue créait une échéance (`POST /api/leases/{id}/payments`) avec `paid_at` et une
 * référence que la création ne lit pas : le loyer reçu devenait une ligne de plus, en attente, à
 * côté de celle qui restait due. Seules les échéances en attente ou en retard se règlent ici, comme
 * le refuse l'API pour les autres (`lease_payment.cannot_mark_paid`).
 */
export function LeasePaymentDialog({ leaseId, open, onOpenChange }: LeasePaymentDialogProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('lease.payment');
  const tMethods = useTranslations('lease.payment.methods');
  const tCommon = useTranslations('common');
  const { data: paymentsData } = useLeasePayments(leaseId);
  const markPaid = useMarkLeasePaymentPaid(leaseId);

  const methodOptions = PAYMENT_METHODS.map((value) => ({ value, label: tMethods(value) }));
  const installmentOptions = (paymentsData?.data ?? [])
    .filter((p) => p.status === 'pending' || p.status === 'late')
    .map((p) => ({
      value: String(p.id),
      label: `${formatDate(p.period_start, locale)} → ${formatDate(p.period_end, locale)} · ${formatCurrency(p.amount, locale, { currency: p.currency })}`,
    }));
  const nothingToSettle = installmentOptions.length === 0;

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    LeasePaymentFormValues,
    unknown
  >({
    schema: leasePaymentSchema,
    defaultValues: {
      payment_id: '',
      payment_method: 'cash',
      paid_at: '',
      reference_number: '',
    },
    onSubmit: async ({ payment_id, payment_method, paid_at, reference_number }) => {
      await markPaid.mutateAsync({
        paymentId: Number(payment_id),
        payment_method,
        ...(paid_at ? { paid_at } : {}),
        ...(reference_number ? { transaction_id: reference_number } : {}),
      });
      return undefined;
    },
    onSuccess: () => {
      form.reset();
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <FormGlobalError>{globalError}</FormGlobalError>
          {nothingToSettle ? (
            <p className="text-sm text-muted-foreground">{t('noInstallment')}</p>
          ) : (
            <FormSelect<LeasePaymentFormValues>
              control={form.control}
              name="payment_id"
              label={t('installment')}
              options={installmentOptions}
              required
            />
          )}
          <FormSelect<LeasePaymentFormValues>
            control={form.control}
            name="payment_method"
            label={t('method')}
            options={methodOptions}
          />
          <FormDatePicker<LeasePaymentFormValues>
            control={form.control}
            name="paid_at"
            label={t('effectiveDate')}
          />
          <FormInput<LeasePaymentFormValues>
            control={form.control}
            name="reference_number"
            label={t('reference')}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || nothingToSettle}>
              {isSubmitting ? t('saving') : tCommon('actions.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
