'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  useApproveMaintenanceQuote,
  useRequestMaintenanceQuote,
} from '@/lib/queries/maintenance';
import type { MaintenanceRequest } from '@/types/maintenance';

import { QuoteRejectionModal } from './QuoteRejectionModal';

/**
 * TCK-592 — les gestes du devis, chacun derrière son drapeau : le donneur d'ordre DEMANDE
 * (`can_request_quote`) ; qui peut TRANCHER (`can_decide_quote` — en `awaiting_owner`, le seul
 * bailleur du bien) approuve ou refuse ; qui peut LIRE le devis en télécharge le PDF.
 */
export function QuoteActions({ request }: { readonly request: MaintenanceRequest }) {
  const t = useTranslations('maintenance.intervention.quote');
  const messageErreur = useMessageErreurApi();
  const requestQuote = useRequestMaintenanceQuote(request.id);
  const approve = useApproveMaintenanceQuote(request.id);
  const [rejectOpen, setRejectOpen] = useState(false);
  const abilities = request.abilities;

  if (!abilities) return null;
  const { can_request_quote, can_decide_quote, can_view_quote_pdf } = abilities;
  if (!can_request_quote && !can_decide_quote && !can_view_quote_pdf) return null;

  const error = requestQuote.error ?? approve.error;

  return (
    <section className="rounded-xl bg-card p-4 sm:p-5">
      {request.status === 'awaiting_owner' ? (
        <p className="mb-3 text-sm text-muted-foreground">
          {can_decide_quote ? t('awaiting_owner_you') : t('awaiting_owner_other')}
        </p>
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

/**
 * Le PDF est servi derrière le jeton : on le récupère en blob (patron d'`InventoryPdfButton`),
 * plutôt que d'ouvrir un onglet qui recevrait un 401.
 */
function QuotePdfButton({ id }: { readonly id: number }) {
  const t = useTranslations('maintenance.intervention.quote');
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const url =
    (process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
      : 'http://localhost:8002') + `/api/maintenance-requests/${id}/quote/pdf`;

  const download = async () => {
    setDownloading(true);
    setErrorMessage(null);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/pdf',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error(t('pdf_failed'));
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `devis-intervention-${id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setErrorMessage(messageErreur(err, t('pdf_failed')));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Button type="button" variant="ghost" className="h-11 sm:h-9" disabled={downloading} onClick={() => void download()}>
        {downloading ? t('pdf_downloading') : t('pdf')}
      </Button>
      {errorMessage ? <span className="self-center text-xs text-destructive">{errorMessage}</span> : null}
    </>
  );
}
