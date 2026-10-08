'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useAcceptMaintenance, useDeclineMaintenance } from '@/lib/queries/maintenance';
import type { MaintenanceRequest } from '@/types/maintenance';

/** Le minimum de `DeclineMaintenanceRequestRequest` : un motif lisible par le donneur d'ordre. */
const REASON_MIN = 3;

/**
 * TCK-592 (P5) — en tête de fiche, pour le prestataire assigné qui n'a pas encore répondu :
 * « J'accepte » ou « Je refuse », motif à l'appui. Rien n'est proposé à qui l'API ne l'accorde pas.
 */
export function MaintenanceProviderResponse({ request }: { readonly request: MaintenanceRequest }) {
  const t = useTranslations('maintenance.intervention.response');
  const messageErreur = useMessageErreurApi();
  const accept = useAcceptMaintenance(request.id);
  const decline = useDeclineMaintenance(request.id);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  const canAccept = request.abilities?.can_accept === true;
  const canDecline = request.abilities?.can_decline === true;
  if (!canAccept && !canDecline) return null;

  const error = accept.error ?? decline.error;
  const pending = accept.isPending || decline.isPending;

  return (
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold text-foreground">{t('title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('body')}</p>

      {declining ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < REASON_MIN) return;
            decline.mutate({ reason: reason.trim() });
          }}
        >
          <label htmlFor="decline-reason" className="block text-sm font-medium">
            {t('reason_label')}
          </label>
          <Textarea
            id="decline-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t('reason_placeholder')}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="destructive"
              className="h-11 sm:h-9"
              disabled={pending || reason.trim().length < REASON_MIN}
            >
              {t('confirm_decline')}
            </Button>
            <Button type="button" variant="ghost" className="h-11 sm:h-9" onClick={() => setDeclining(false)}>
              {t('back')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {canAccept ? (
            <Button type="button" className="h-11 sm:h-9" disabled={pending} onClick={() => accept.mutate()}>
              {t('accept')}
            </Button>
          ) : null}
          {canDecline ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-9"
              disabled={pending}
              onClick={() => setDeclining(true)}
            >
              {t('decline')}
            </Button>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {messageErreur(error, t('failed'))}
        </p>
      ) : null}
    </section>
  );
}
