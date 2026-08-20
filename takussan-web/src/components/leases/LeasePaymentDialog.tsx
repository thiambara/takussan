'use client';

import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormInput, FormSelect, FormTextarea, FormGlobalError, FormDatePicker } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useCreateLeasePayment } from '@/lib/queries/leases';
import { leasePaymentSchema, type LeasePaymentFormValues } from '@/lib/schemas/lease';

interface LeasePaymentDialogProps {
  readonly leaseId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** Les valeurs d'enum du backend ; les libellés vivent sous `lease.payment.{methods,types}.*`. */
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'mobile_money', 'check', 'card'] as const;
const PAYMENT_TYPES = [
  'rent',
  'charges',
  'deposit',
  'deposit_refund',
  'regularization',
  'penalty',
] as const;

export function LeasePaymentDialog({ leaseId, open, onOpenChange }: LeasePaymentDialogProps) {
  const t = useTranslations('lease.payment');
  const tMethods = useTranslations('lease.payment.methods');
  const tTypes = useTranslations('lease.payment.types');
  const tCommon = useTranslations('common');
  const createPayment = useCreateLeasePayment(leaseId);

  const methodOptions = PAYMENT_METHODS.map((value) => ({ value, label: tMethods(value) }));
  const typeOptions = PAYMENT_TYPES.map((value) => ({ value, label: tTypes(value) }));

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    LeasePaymentFormValues,
    unknown
  >({
    schema: leasePaymentSchema,
    defaultValues: {
      amount: 0,
      payment_method: 'cash',
      payment_type: 'rent',
      period_start: '',
      period_end: '',
      paid_at: '',
      reference_number: '',
      notes: '',
    },
    onSubmit: async (values) => {
      await createPayment.mutateAsync(values);
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
          <FormInput<LeasePaymentFormValues>
            control={form.control}
            name="amount"
            type="number"
            label={t('amount')}
            required
            min={0}
            step={100}
          />
          <FormSelect<LeasePaymentFormValues>
            control={form.control}
            name="payment_type"
            label={t('type')}
            options={typeOptions}
          />
          <FormSelect<LeasePaymentFormValues>
            control={form.control}
            name="payment_method"
            label={t('method')}
            options={methodOptions}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormDatePicker<LeasePaymentFormValues>
              control={form.control}
              name="period_start"
              label={t('periodStart')}
              required
            />
            <FormDatePicker<LeasePaymentFormValues>
              control={form.control}
              name="period_end"
              label={t('periodEnd')}
              required
            />
          </div>
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
          <FormTextarea<LeasePaymentFormValues>
            control={form.control}
            name="notes"
            label={t('notes')}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('saving') : tCommon('actions.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
