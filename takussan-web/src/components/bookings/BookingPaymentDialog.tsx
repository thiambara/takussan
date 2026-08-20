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
import { FormInput, FormSelect, FormTextarea, FormGlobalError } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useCreateBookingPayment } from '@/lib/queries/bookings';
import { bookingPaymentSchema, type BookingPaymentFormValues } from '@/lib/schemas/booking';

interface BookingPaymentDialogProps {
  readonly bookingId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * TCK-292 — les deux tables transportent la CLÉ (relative à `bookings.paymentDialog`) ;
 * le composant les résout en libellés au rendu.
 */
const PAYMENT_METHOD_VALUES = ['cash', 'bank_transfer', 'mobile_money', 'card'] as const;
const PAYMENT_TYPE_VALUES = ['deposit', 'advance', 'fee'] as const;

export function BookingPaymentDialog({
  bookingId,
  open,
  onOpenChange,
}: BookingPaymentDialogProps) {
  const t = useTranslations('bookings.paymentDialog');
  const tCommon = useTranslations('common');
  const createPayment = useCreateBookingPayment(bookingId);

  const paymentMethodOptions = PAYMENT_METHOD_VALUES.map((value) => ({
    value,
    label: t(`methods.${value}`),
  }));
  const paymentTypeOptions = PAYMENT_TYPE_VALUES.map((value) => ({
    value,
    label: t(`types.${value}`),
  }));

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<
    BookingPaymentFormValues,
    unknown
  >({
    schema: bookingPaymentSchema,
    defaultValues: {
      amount: 0,
      payment_method: 'cash',
      payment_type: 'deposit',
      transaction_id: '',
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
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <FormGlobalError>{globalError}</FormGlobalError>
          <FormInput<BookingPaymentFormValues>
            control={form.control}
            name="amount"
            type="number"
            label={t('fields.amount')}
            required
            min={0}
            step={100}
          />
          <FormSelect<BookingPaymentFormValues>
            control={form.control}
            name="payment_type"
            label={t('fields.type')}
            options={paymentTypeOptions}
          />
          <FormSelect<BookingPaymentFormValues>
            control={form.control}
            name="payment_method"
            label={t('fields.method')}
            options={paymentMethodOptions}
          />
          <FormInput<BookingPaymentFormValues>
            control={form.control}
            name="transaction_id"
            label={t('fields.transactionId')}
          />
          <FormTextarea<BookingPaymentFormValues>
            control={form.control}
            name="notes"
            label={t('fields.notes')}
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('submitting') : tCommon('actions.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
