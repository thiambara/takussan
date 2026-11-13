'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { RappelDuSeuil } from '@/components/maintenance/acteurs/RappelDuSeuil';
import { Button } from '@/components/ui/button';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import type { FicheDuBailleur } from '@/lib/maintenance/devis-du-bailleur';
import {
  useApproveMaintenanceQuote,
  useRequestMaintenanceQuote,
} from '@/lib/queries/maintenance';
import type { MaintenanceRequest } from '@/types/maintenance';

import { QuotePdfButton } from './QuotePdfButton';
import { QuoteRejectionModal } from './QuoteRejectionModal';

/**
 * TCK-592 — les gestes du devis, chacun derrière son drapeau : le donneur d'ordre DEMANDE
 * (`can_request_quote`) ; qui peut TRANCHER (`can_decide_quote` — en `awaiting_owner`, le seul
 * bailleur du bien) approuve ou refuse ; qui peut LIRE le devis en télécharge le PDF (`QuotePdfButton`).
 */
export function QuoteActions({
  request,
  sansDemande = false,
}: {
  readonly request: MaintenanceRequest;
  /** TCK-2653 — la fiche de l'agence demande le devis par « Autre action » : le bouton n'est pas doublé ici. */
  readonly sansDemande?: boolean;
}) {
  const t = useTranslations('maintenance.intervention.quote');
  const messageErreur = useMessageErreurApi();
  const requestQuote = useRequestMaintenanceQuote(request.id);
  const approve = useApproveMaintenanceQuote(request.id);
  const [rejectOpen, setRejectOpen] = useState(false);
  const abilities = request.abilities;

  if (!abilities) return null;
  const { can_decide_quote, can_view_quote_pdf } = abilities;
  const can_request_quote = abilities.can_request_quote && !sansDemande;
  if (!can_request_quote && !can_decide_quote && !can_view_quote_pdf) return null;

  const error = requestQuote.error ?? approve.error;

  return (
    <section className="rounded-xl bg-card p-4 sm:p-5">
      {request.status === 'awaiting_owner' ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {can_decide_quote ? t('awaiting_owner_you') : t('awaiting_owner_other')}
        </p>
      ) : null}
      {/* TCK-2654 — le bailleur qui tranche (la notification `maintenance_quote.awaiting_owner` mène ici) lit son
          plafond, comme sur sa liste ; jamais l'agence (« votre mandat » s'adresse au bailleur). */}
      {request.status === 'awaiting_owner' && can_decide_quote ? (
        <RappelDuSeuil fiche={request as FicheDuBailleur} className="mb-3" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {can_request_quote ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9"
            disabled={requestQuote.isPending}
            onClick={() => requestQuote.mutate()}
          >
            {t('request')}
          </Button>
        ) : null}
        {can_decide_quote ? (
          <>
            <Button
              type="button"
              className="h-11 sm:h-9"
              disabled={approve.isPending}
              onClick={() => approve.mutate()}
            >
              {t('approve')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9"
              onClick={() => setRejectOpen(true)}
            >
              {t('reject')}
            </Button>
          </>
        ) : null}
        {can_view_quote_pdf ? <QuotePdfButton id={request.id} /> : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {messageErreur(error, t('failed'))}
        </p>
      ) : null}

      <QuoteRejectionModal id={request.id} open={rejectOpen} onClose={() => setRejectOpen(false)} />
    </section>
  );
}
