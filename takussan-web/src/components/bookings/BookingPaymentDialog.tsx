'use client';

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

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Espèces' },
  { value: 'bank_transfer', label: 'Virement bancaire' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'card', label: 'Carte bancaire' },
] as const;

const PAYMENT_TYPE_OPTIONS = [
  { value: 'deposit', label: 'Acompte' },
  { value: 'advance', label: 'Avance' },
  { value: 'fee', label: 'Frais' },
] as const;

export function BookingPaymentDialog({
  bookingId,
  open,
  onOpenChange,
}: BookingPaymentDialogProps) {
  const createPayment = useCreateBookingPayment(bookingId);

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
          <DialogTitle>Enregistrer un paiement</DialogTitle>
          <DialogDescription>
            Acompte, avance ou frais liés à cette réservation.
          </DialogDescription>
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
            label="Montant"
            required
            min={0}
            step={100}
          />
          <FormSelect<BookingPaymentFormValues>
            control={form.control}
            name="payment_type"
            label="Type"
            options={PAYMENT_TYPE_OPTIONS}
          />
          <FormSelect<BookingPaymentFormValues>
            control={form.control}
            name="payment_method"
            label="Moyen de paiement"
            options={PAYMENT_METHOD_OPTIONS}
          />
          <FormInput<BookingPaymentFormValues>
            control={form.control}
            name="transaction_id"
            label="ID transaction (optionnel)"
          />
          <FormTextarea<BookingPaymentFormValues>
            control={form.control}
            name="notes"
            label="Notes"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
