'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  useInvoice,
  useInvoiceCancel,
  useInvoiceMarkPaid,
  useInvoiceSend,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { InvoiceStatus } from '@/types/invoice';

import {
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
} from './constants';
import { PayOnlineButton } from './PayOnlineButton';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';

interface InvoiceDetailDialogProps {
  readonly invoiceId: number | null;
  readonly onClose: () => void;
}

export function InvoiceDetailDialog({ invoiceId, onClose }: InvoiceDetailDialogProps) {
  const locale = useLocale() as Locale;
  const { data, isLoading, isError, error } = useInvoice(invoiceId);
  const send = useInvoiceSend(invoiceId ?? 0);
  const markPaid = useInvoiceMarkPaid(invoiceId ?? 0);
  const cancel = useInvoiceCancel(invoiceId ?? 0);

  const handleAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        // errors surfaced via mutation.isError
      }
    },
    [],
  );

  const invoice = data?.data;
  const status = (invoice?.status ?? 'draft') as InvoiceStatus;
  const { providers } = usePaymentProviders(invoice?.agency_id ?? null);

  return (
    <Dialog open={invoiceId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Facture {invoice?.reference_number ?? `#${invoiceId}`}</DialogTitle>
          <DialogDescription>
            Statut et transitions de la facture.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-app-surface-1" />
        ) : isError ? (
          <p className="rounded-xl bg-app-surface-1 p-4 text-sm text-red-600">
            {error instanceof ApiError ? error.displayMessage : 'Facture introuvable.'}
          </p>
        ) : invoice ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={INVOICE_STATUS_VARIANT[status] ?? 'outline'}>
                {INVOICE_STATUS_LABEL[status] ?? status}
              </Badge>
              <span className="text-xs text-app-ink-muted">
                Émise le {invoice.issue_date ? formatDate(invoice.issue_date, locale) : '—'}
              </span>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Client</dt>
                <dd className="mt-0.5 text-app-ink">#{invoice.customer_id}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Échéance</dt>
                <dd className="mt-0.5 text-app-ink">
                  {invoice.due_date ? formatDate(invoice.due_date, locale) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Sous-total</dt>
                <dd className="mt-0.5 text-app-ink">
                  {formatCurrency(invoice.subtotal, locale, {
                    currency: invoice.currency || 'XOF',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-app-ink-muted">Total</dt>
                <dd className="mt-0.5 font-semibold text-app-ink">
                  {formatCurrency(invoice.total_amount, locale, {
                    currency: invoice.currency || 'XOF',
                  })}
                </dd>
              </div>
              {invoice.tax_rate ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-app-ink-muted">TVA</dt>
                  <dd className="mt-0.5 text-app-ink">
                    {invoice.tax_rate}% ({formatCurrency(invoice.tax_amount ?? 0, locale, {
                      currency: invoice.currency || 'XOF',
                    })})
                  </dd>
                </div>
              ) : null}
            </dl>

            {invoice.notes ? (
              <p className="whitespace-pre-line rounded-lg bg-app-surface-1 p-3 text-sm text-app-ink">
                {invoice.notes}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              {status === 'draft' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={send.isPending}
                  onClick={() => void handleAction(() => send.mutateAsync())}
                >
                  {send.isPending ? 'Envoi…' : 'Envoyer'}
                </Button>
              ) : null}
              {status !== 'paid' && status !== 'cancelled' && status !== 'void' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={markPaid.isPending}
                  onClick={() => void handleAction(() => markPaid.mutateAsync())}
                >
                  {markPaid.isPending ? '…' : 'Marquer payée'}
                </Button>
              ) : null}
              {status !== 'cancelled' && status !== 'void' && status !== 'paid' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => void handleAction(() => cancel.mutateAsync())}
                >
                  {cancel.isPending ? '…' : 'Annuler la facture'}
                </Button>
              ) : null}
              {status !== 'paid' && status !== 'cancelled' && status !== 'void' && invoiceId ? (
                <PayOnlineButton
                  paymentType="invoices"
                  paymentId={invoiceId}
                  currency={invoice.currency || 'XOF'}
                  availableProviders={providers}
                />
              ) : null}
              <Button variant="ghost" type="button" onClick={onClose}>
                Fermer
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
