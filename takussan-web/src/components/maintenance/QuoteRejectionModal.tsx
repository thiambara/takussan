'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormTextarea, FormGlobalError } from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { useRejectMaintenanceQuote } from '@/lib/queries/maintenance';
import { z } from 'zod';

/**
 * Le message de validation vient du dictionnaire — donc d'un traducteur, donc d'un hook. Le
 * schéma est bâti DANS le composant (TCK-292, lot I) plutôt qu'au module : c'est le seul endroit
 * où `t` existe. Le patron « clé portée par le schéma » du lot J vise `src/lib/schemas/`, partagé
 * entre serveur et client ; ce schéma-ci est local à un composant client, et n'en a pas besoin.
 */
function construireSchema(t: (cle: string) => string) {
  return z.object({
    reason: z.string().min(5, t('reason_min')).max(1000),
  });
}

type FormValues = z.infer<ReturnType<typeof construireSchema>>;

export function QuoteRejectionModal({ 
  id, 
  open, 
  onClose 
}: { 
  readonly id: number;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const t = useTranslations('maintenance.quote.reject');
  const tCommon = useTranslations('common');
  const mutation = useRejectMaintenanceQuote(id);
  const schema = useMemo(() => construireSchema(t), [t]);

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
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormGlobalError>{globalError}</FormGlobalError>
          
          <FormTextarea
            name="reason"
            control={form.control}
            label={t('reason_label')}
            placeholder={t('reason_placeholder')}
            rows={4}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {tCommon('actions.cancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {t('confirm')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
