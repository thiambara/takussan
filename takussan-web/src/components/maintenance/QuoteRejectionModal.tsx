'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormTextarea, FormGlobalError } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useRejectMaintenanceQuote } from '@/lib/queries/maintenance';
import { z } from 'zod';

const schema = z.object({
  reason: z.string().min(5, 'Le motif doit contenir au moins 5 caractères').max(1000),
});

type FormValues = z.infer<typeof schema>;

export function QuoteRejectionModal({ 
  id, 
  open, 
  onClose 
}: { 
  readonly id: number;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const mutation = useRejectMaintenanceQuote(id);
  
  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<FormValues, unknown>({
    schema,
    defaultValues: {
      reason: '',
    },
    onSubmit: async (values) => {
      return mutation.mutateAsync({ reason: values.reason });
    },
    onSuccess: () => {
      onClose();
    },
  });

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeter le devis</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormGlobalError>{globalError}</FormGlobalError>
          
          <FormTextarea
            name="reason"
            control={form.control}
            label="Motif du rejet"
            placeholder="Veuillez expliquer pourquoi ce devis est refusé..."
            rows={4}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              Confirmer le rejet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
