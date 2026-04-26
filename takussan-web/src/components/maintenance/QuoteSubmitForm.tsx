'use client';

import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormInput, FormGlobalError } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useSubmitMaintenanceQuote } from '@/lib/queries/maintenance';
import type { MaintenanceRequest } from '@/types/maintenance';

const schema = z.object({
  amount: z.coerce.number().positive('Le montant doit être positif'),
  currency: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function QuoteSubmitForm({ request }: { readonly request: MaintenanceRequest }) {
  const mutation = useSubmitMaintenanceQuote(request.id);
  const [attachments, setAttachments] = useState<File[]>([]);
  
  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<FormValues, unknown>({
    schema,
    defaultValues: {
      amount: undefined as any,
      currency: '',
    },
    onSubmit: async (values) => {
      return mutation.mutateAsync({
        amount: values.amount,
        currency: values.currency,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    },
    onSuccess: () => {
      setAttachments([]);
    },
  });

  if (request.status !== 'quote_requested') {
    return null;
  }

  return (
    <div className="rounded-2xl bg-app-surface-1 p-5">
      <h3 className="text-sm font-semibold text-app-ink">Soumettre un devis</h3>
      <p className="mb-4 mt-1 text-xs text-app-ink-muted">
        Veuillez indiquer le montant estimé pour cette intervention.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormGlobalError>{globalError}</FormGlobalError>
        
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            name="amount"
            control={form.control}
            label="Montant"
            type="number"
            step="0.01"
            placeholder="0.00"
          />
          <FormInput
            name="currency"
            control={form.control}
            label="Devise (optionnel)"
            placeholder="XOF, EUR..."
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Fichiers joints (Devis PDF, photos, etc.)
          </label>
          <input
            type="file"
            multiple
            onChange={(e) => setAttachments(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-app-ink-muted"
          />
          {attachments.length > 0 && (
            <p className="mt-1 text-xs text-app-ink-muted">
              {attachments.length} fichier{attachments.length > 1 ? 's' : ''} sélectionné{attachments.length > 1 ? 's' : ''}.
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Envoi...' : 'Envoyer le devis'}
          </Button>
        </div>
      </form>
    </div>
  );
}
