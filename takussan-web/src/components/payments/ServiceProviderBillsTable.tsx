'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { formatCurrency } from '@/lib/format';
import {
  usePayServiceProviderBill,
  useRejectServiceProviderBill,
  useServiceProviderBills,
  useValidateServiceProviderBill,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { ServiceProviderBill } from '@/types/invoice';

import { SERVICE_PROVIDER_BILL_STATUS_TONE } from './constants';

interface ServiceProviderBillsTableProps {
  /**
   * `provider` : le prestataire lit ses factures et leur état de paiement, sans geste.
   * `agency` : le personnel qui tient `payouts.create` valide, rejette ou fait payer.
   */
  readonly mode: 'provider' | 'agency';
  /** Le reversement créé par « Payer » — l'appelant l'ouvre (approbation, marquage payé). */
  readonly onPaid?: (payoutId: number) => void;
}

/**
 * TCK-594 (ADR-0039 §8) — les factures d'intervention.
 *
 * Valider n'est pas payer : une facture validée « refacturable » s'impute sur le prochain
 * reversement du bailleur ; sinon « Payer » crée un reversement au prestataire, soumis au seuil des
 * quatre yeux, que l'agence marque payé comme les autres. Le serveur refuse au prestataire de
 * valider sa propre facture (`segregation.approve`) ; le dépassement du devis se lit AVANT le geste.
 */
export function ServiceProviderBillsTable({ mode, onPaid }: ServiceProviderBillsTableProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.serviceProviderBills');
  const tStatus = useTranslations('payments.serviceProviderBills.status');
  const messageErreur = useMessageErreurApi();
  const { user } = useAuth();
  const query = useServiceProviderBills(
    mode === 'provider' ? { provider_id: user?.id } : { agency_id: user?.agency_id ?? undefined },
    Boolean(user?.id),
  );
  const validate = useValidateServiceProviderBill();
  const reject = useRejectServiceProviderBill();
  const pay = usePayServiceProviderBill();

  const [rechargeable, setRechargeable] = useState<Record<number, boolean>>({});
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(messageErreur(e, t('actionFailed')));
      return false;
    }
  };

  const actions = (bill: ServiceProviderBill) => {
    if (mode !== 'agency') return null;
    if (bill.status === 'pending_validation') {
      if (rejecting === bill.id) {
        return (
          <div className="flex min-w-64 flex-col gap-2">
            <Textarea
              aria-label={t('rejectionReason')}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={reason.trim() === '' || reject.isPending}
                onClick={async () => {
                  if (await act(() => reject.mutateAsync({ id: bill.id, rejection_reason: reason.trim() }))) {
                    setRejecting(null);
                    setReason('');
                  }
                }}
              >
                {t('confirmReject')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1.5 text-xs text-foreground">
            <input
              type="checkbox"
              checked={rechargeable[bill.id] ?? false}
              onChange={(e) => setRechargeable((prev) => ({ ...prev, [bill.id]: e.target.checked }))}
              className="size-4 rounded border-input accent-primary"
            />
            {t('rechargeable')}
          </label>
          <Button
            type="button"
            size="sm"
            disabled={validate.isPending}
            onClick={() =>
              void act(() =>
                validate.mutateAsync({ id: bill.id, rechargeable_to_landlord: rechargeable[bill.id] ?? false }),
              )
            }
          >
            {t('validate')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(bill.id)}>
            {t('reject')}
          </Button>
        </div>
      );
    }
    if (bill.status === 'validated' && !bill.rechargeable_to_landlord && bill.imputed_payout_id === null) {
      return (
        <Button
          type="button"
          size="sm"
          disabled={pay.isPending}
          onClick={async () => {
            setError(null);
            try {
              const res = await pay.mutateAsync({ id: bill.id });
              onPaid?.(res.data.id);
            } catch (e) {
              setError(messageErreur(e, t('actionFailed')));
            }
          }}
        >
          {t('pay')}
        </Button>
      );
    }
    return null;
  };

  return (
    <section aria-labelledby={`spb-${mode}-title`} className="space-y-3">
      <h2 id={`spb-${mode}-title`} className="text-base font-semibold text-foreground">
        {mode === 'provider' ? t('providerTitle') : t('agencyTitle')}
      </h2>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <QueryBoundary
        query={query}
        loadingFallback={[0, 1].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      >
        {(data) => {
          const rows = data.data ?? [];
          if (rows.length === 0) {
            return (
              <EmptyState
                icon={<Wrench className="size-8" aria-hidden="true" />}
                title={t('emptyTitle')}
                description={mode === 'provider' ? t('emptyProvider') : t('emptyAgency')}
              />
            );
          }
          return (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">{t('reference')}</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">{t('intervention')}</th>
                    <th className="px-3 py-2 text-right font-medium whitespace-nowrap">{t('amount')}</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">{t('statusLabel')}</th>
                    {mode === 'agency' ? <th className="px-3 py-2" aria-label={t('actions')} /> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((bill) => (
                    <tr key={bill.id} className="align-top text-foreground">
                      <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-muted-foreground">
                        {bill.reference_number ?? `#${bill.id}`}
                        {bill.provider_reference ? <span className="block">{bill.provider_reference}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {bill.maintenance_request_id ? `#${bill.maintenance_request_id}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                        {formatCurrency(bill.amount, locale, { currency: bill.currency || 'XOF' })}
                        {bill.exceeds_quote ? (
                          <span className="block text-xs font-normal text-destructive">{t('exceedsQuote')}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <StatusBadge tone={SERVICE_PROVIDER_BILL_STATUS_TONE[bill.status] ?? 'neutral'} label={tStatus(bill.status)} />
                        {bill.status === 'rejected' && bill.rejection_reason ? (
                          <span className="mt-1 block max-w-64 text-muted-foreground">{bill.rejection_reason}</span>
                        ) : null}
                        {bill.status === 'validated' && bill.rechargeable_to_landlord ? (
                          <span className="mt-1 block text-muted-foreground">{t('rechargedToLandlord')}</span>
                        ) : null}
                      </td>
                      {mode === 'agency' ? <td className="px-3 py-2.5 text-right">{actions(bill)}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
