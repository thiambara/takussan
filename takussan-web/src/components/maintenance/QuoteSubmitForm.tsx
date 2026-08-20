'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { FormInput, FormGlobalError } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useSubmitMaintenanceQuote } from '@/lib/queries/maintenance';
import type { MaintenanceRequest } from '@/types/maintenance';

/** Cf. `QuoteRejectionModal` : le message vient du dictionnaire, donc le schéma naît dans le composant. */
function construireSchema(t: (cle: string) => string) {
  return z.object({
    amount: z.coerce.number().positive(t('amount_positive')),
    currency: z.string().optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof construireSchema>>;

export function QuoteSubmitForm({ request }: { readonly request: MaintenanceRequest }) {
  const t = useTranslations('maintenance.quote.submit');
  const mutation = useSubmitMaintenanceQuote(request.id);
  const [attachments, setAttachments] = useState<File[]>([]);
  const schema = useMemo(() => construireSchema(t), [t]);

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<FormValues, unknown>({
    schema,
    defaultValues: {
      amount: undefined as unknown as number,
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
      <h3 className="text-sm font-semibold text-app-ink">{t('title')}</h3>
      <p className="mb-4 mt-1 text-xs text-app-ink-muted">{t('intro')}</p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormGlobalError>{globalError}</FormGlobalError>
        
        <div className="grid grid-cols-2 gap-4">
          <FormInput
            name="amount"
            control={form.control}
            label={t('amount_label')}
            type="number"
            step="0.01"
            placeholder="0.00"
          />
          <FormInput
            name="currency"
            control={form.control}
            label={t('currency_label')}
            placeholder={t('currency_placeholder')}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            {t('attachments_label')}
          </label>
          <input
            type="file"
            multiple
            onChange={(e) => setAttachments(Array.from(e.target.files ?? []))}
            className="block w-full text-sm text-app-ink-muted"
          />
          {attachments.length > 0 && (
            <p className="mt-1 text-xs text-app-ink-muted">
              {t('attachments_selected', { count: attachments.length })}
            </p>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
