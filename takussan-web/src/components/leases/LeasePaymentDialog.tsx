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
import { useCreateLeasePayment } from '@/lib/queries/leases';
import { leasePaymentSchema, type LeasePaymentFormValues } from '@/lib/schemas/lease';

interface LeasePaymentDialogProps {
  readonly leaseId: number;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Espèces' },
  { value: 'bank_transfer', label: 'Virement bancaire' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'check', label: 'Chèque' },
  { value: 'card', label: 'Carte bancaire' },
];

const PAYMENT_TYPE_OPTIONS = [
  { value: 'rent', label: 'Loyer' },
  { value: 'charges', label: 'Charges' },
  { value: 'deposit', label: 'Caution' },
  { value: 'deposit_refund', label: 'Remboursement caution' },
  { value: 'regularization', label: 'Régularisation' },
  { value: 'penalty', label: 'Pénalité' },
];

export function LeasePaymentDialog({ leaseId, open, onOpenChange }: LeasePaymentDialogProps) {
  const createPayment = useCreateLeasePayment(leaseId);

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
          <DialogTitle>Enregistrer un paiement</DialogTitle>
          <DialogDescription>
            Loyer, charges ou régularisation pour ce bail.
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
            label="Montant"
            required
            min={0}
            step={100}
          />
          <FormSelect<LeasePaymentFormValues>
            control={form.control}
            name="payment_type"
            label="Type"
            options={PAYMENT_TYPE_OPTIONS}
          />
          <FormSelect<LeasePaymentFormValues>
            control={form.control}
            name="payment_method"
            label="Moyen"
            options={PAYMENT_METHOD_OPTIONS}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormInput<LeasePaymentFormValues>
              control={form.control}
              name="period_start"
              type="date"
              label="Période début"
              required
            />
            <FormInput<LeasePaymentFormValues>
              control={form.control}
              name="period_end"
              type="date"
              label="Période fin"
              required
            />
          </div>
          <FormInput<LeasePaymentFormValues>
            control={form.control}
            name="paid_at"
            type="date"
            label="Date effective"
          />
          <FormInput<LeasePaymentFormValues>
            control={form.control}
            name="reference_number"
            label="Référence / Reçu"
          />
          <FormTextarea<LeasePaymentFormValues>
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
