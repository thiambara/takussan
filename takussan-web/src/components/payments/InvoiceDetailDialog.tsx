'use client';

import { useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { formatCurrency, formatDate } from '@/lib/format';
import {
  useInvoice,
  useInvoiceCancel,
  useInvoiceMarkPaid,
  useInvoiceSend,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { InvoiceStatus } from '@/types/invoice';

import { INVOICE_STATUS_VARIANT } from './constants';
import { PayOnlineButton } from './PayOnlineButton';
import { usePaymentProviders } from '@/hooks/usePaymentProviders';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

interface InvoiceDetailDialogProps {
  readonly invoiceId: number | null;
  readonly onClose: () => void;
}

export function InvoiceDetailDialog({ invoiceId, onClose }: InvoiceDetailDialogProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.invoiceDetail');
  const tStatus = useTranslations('payments.invoiceStatus');
  const messageErreur = useMessageErreurApi();
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
          <DialogTitle>
            {t('title', { reference: invoice?.reference_number ?? `#${invoiceId}` })}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-card" />
        ) : isError ? (
          <p className="rounded-xl bg-card p-4 text-sm text-red-600">
            {messageErreur(error, t('notFound'))}
          </p>
        ) : invoice ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={INVOICE_STATUS_VARIANT[status] ?? 'outline'}>
                {tStatus(status)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t('issuedOn', {
                  date: invoice.issue_date ? formatDate(invoice.issue_date, locale) : '—',
                })}
              </span>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('customer')}</dt>
                <dd className="mt-0.5 text-foreground">#{invoice.customer_id}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('dueDate')}</dt>
                <dd className="mt-0.5 text-foreground">
                  {invoice.due_date ? formatDate(invoice.due_date, locale) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('subtotal')}</dt>
                <dd className="mt-0.5 text-foreground">
                  {formatCurrency(invoice.subtotal, locale, {
                    currency: invoice.currency || 'XOF',
                  })}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('total')}</dt>
                <dd className="mt-0.5 font-semibold text-foreground">
                  {formatCurrency(invoice.total_amount, locale, {
                    currency: invoice.currency || 'XOF',
                  })}
                </dd>
              </div>
              {invoice.tax_rate ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('tax')}</dt>
                  <dd className="mt-0.5 text-foreground">
                    {t('taxValue', {
                      // String() délibéré : ICU formaterait 1.5 en « 1,5 » sous fr, là où le JSX
                      // d'origine rendait le nombre brut. Aucun rendu ne doit changer (TCK-292).
                      rate: String(invoice.tax_rate),
                      amount: formatCurrency(invoice.tax_amount ?? 0, locale, {
                        currency: invoice.currency || 'XOF',
                      }),
                    })}
                  </dd>
                </div>
              ) : null}
            </dl>

            {invoice.notes ? (
              <p className="whitespace-pre-line rounded-lg bg-card p-3 text-sm text-foreground">
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
                  {send.isPending ? t('sending') : t('send')}
                </Button>
              ) : null}
              {status !== 'paid' && status !== 'cancelled' && status !== 'void' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={markPaid.isPending}
                  onClick={() => void handleAction(() => markPaid.mutateAsync())}
                >
                  {markPaid.isPending ? t('working') : t('markPaid')}
                </Button>
              ) : null}
              {status !== 'cancelled' && status !== 'void' && status !== 'paid' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => void handleAction(() => cancel.mutateAsync())}
                >
                  {cancel.isPending ? t('working') : t('cancelInvoice')}
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
                {t('close')}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
