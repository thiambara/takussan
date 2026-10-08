'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { formatCurrency, formatDate } from '@/lib/format';
import { OWNER_PROFILE_FIELDS, type OwnerProfileSummary } from '@/lib/queries/owners';
import { useCreatePayout, usePayoutPreparation, useVerifyPayoutMethod } from '@/lib/queries/payments';
import type { PaginatedResponse } from '@/types/api';
import type { Locale } from '@/i18n/config';

import { PAYMENT_METHOD_VALUES } from './constants';

interface CreatePayoutDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (payoutId: number) => void;
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground';

function ownerName(owner: OwnerProfileSummary): string {
  const first = owner.user?.first_name ?? owner.metadata?.first_name ?? '';
  const last = owner.user?.last_name ?? owner.metadata?.last_name ?? '';
  return `${first} ${last}`.trim() || owner.user?.email || owner.metadata?.email || `#${owner.user_id}`;
}

/**
 * TCK-594 (ADR-0039 §1) — préparer un reversement, c'est CHOISIR un bailleur et une période, puis
 * LIRE le calcul : les loyers et réservations encaissés, la commission ligne par ligne, les frais
 * d'intervention imputés, le net. Aucun montant ne se saisit ; le serveur recalcule tout à la
 * création depuis les identifiants cités.
 */
export function CreatePayoutDialog({ open, onOpenChange, onCreated }: CreatePayoutDialogProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.payoutDialog');
  const tMethod = useTranslations('payments.methods');
  const tKind = useTranslations('payments.payoutMethodKinds');
  const messageErreur = useMessageErreurApi();
  const { user } = useAuth();
  const agencyId = user?.agency_id ?? null;

  const [landlordId, setLandlordId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  // VERIF-594 N-1 — `null` : pas encore choisie. La destination par défaut du bénéficiaire, si elle
  // est vérifiée pour l'agence, est alors présélectionnée (le serveur la prend de même).
  const [payoutMethodChoice, setPayoutMethodId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const owners = useApiQuery<PaginatedResponse<OwnerProfileSummary>>(
    ['owners', 'payout-dialog', agencyId],
    '/api/owners',
    {
      params: {
        fields: { owner_profiles: OWNER_PROFILE_FIELDS },
        include: ['user'],
        filter: { agency_id: agencyId ?? undefined, status: 'active' },
        per_page: 100,
      },
      enabled: open && agencyId !== null,
    },
  );

  const preparation = usePayoutPreparation({
    landlord_id: landlordId ? Number(landlordId) : undefined,
    period_start: periodStart || undefined,
    period_end: periodEnd || undefined,
  });
  const createPayout = useCreatePayout();
  const verifyMethod = useVerifyPayoutMethod();

  const prep = preparation.data?.data;
  const currency = prep?.currency ?? 'XOF';
  const money = (amount: number) => formatCurrency(amount, locale, { currency });
  const lineCount = prep
    ? prep.lines.lease_payments.length + prep.lines.booking_payments.length + prep.lines.service_provider_bills.length
    : 0;
  // TCK-594 (ADR-0039 §6) — l'agence vérifie la destination qu'elle va payer : le titulaire la
  // déclare, quelqu'un d'autre la confirme (le serveur refuse au titulaire de se vérifier lui-même).
  const defaultVerified = prep?.payout_methods.find((m) => m.is_default && m.verified);
  const payoutMethodId = payoutMethodChoice ?? (defaultVerified ? String(defaultVerified.id) : '');
  const selectedMethod = prep?.payout_methods.find((m) => String(m.id) === payoutMethodId);
  const verifyDestination = async (id: number) => {
    setError(null);
    try {
      await verifyMethod.mutateAsync({ id });
    } catch (e) {
      setError(messageErreur(e, t('verifyFailed')));
    }
  };
  const canSubmit = prep !== undefined && lineCount > 0 && prep.totals.net >= 0 && !createPayout.isPending;

  const reset = () => {
    setLandlordId('');
    setPeriodStart('');
    setPeriodEnd('');
    setPayoutMethodId(null);
    setPaymentMethod('');
    setScheduledAt('');
    setNotes('');
    setError(null);
  };

  const submit = async () => {
    if (!prep) return;
    setError(null);
    try {
      const res = await createPayout.mutateAsync({
        landlord_id: prep.landlord_id,
        lease_payment_ids: prep.lines.lease_payments.map((l) => l.id),
        booking_payment_ids: prep.lines.booking_payments.map((l) => l.id),
        service_provider_bill_ids: prep.lines.service_provider_bills.map((l) => l.id),
        period_start: prep.period_start,
        period_end: prep.period_end,
        payout_method_id: payoutMethodId ? Number(payoutMethodId) : undefined,
        payment_method: paymentMethod || undefined,
        scheduled_at: scheduledAt || undefined,
        notes: notes || undefined,
      });
      reset();
      onOpenChange(false);
      onCreated?.(res.data.id);
    } catch (e) {
      setError(messageErreur(e, t('createFailed')));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="payout-landlord">{t('landlord')}</Label>
              <select
                id="payout-landlord"
                className={SELECT_CLASS}
                value={landlordId}
                disabled={owners.isLoading}
                onChange={(e) => {
                  setLandlordId(e.target.value);
                  setPayoutMethodId(null);
                }}
              >
                <option value="">{t('landlordPlaceholder')}</option>
                {(owners.data?.data ?? [])
                  .filter((o) => o.user_id !== null)
                  .map((o) => (
                    <option key={o.id} value={String(o.user_id)}>
                      {ownerName(o)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout-period-start">{t('periodStart')}</Label>
              <Input
                id="payout-period-start"
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="payout-period-end">{t('periodEnd')}</Label>
              <Input
                id="payout-period-end"
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {preparation.isError ? (
            <p role="alert" className="rounded-xl bg-card p-3 text-sm text-destructive">
              {messageErreur(preparation.error, t('preparationFailed'))}
            </p>
          ) : preparation.isFetching ? (
            <div className="h-24 animate-pulse rounded-xl bg-card" aria-busy="true" />
          ) : prep ? (
            <section aria-labelledby="payout-calculation" className="space-y-3">
              <h3 id="payout-calculation" className="text-sm font-semibold text-foreground">
                {t('calculation')}
              </h3>
              {lineCount === 0 ? (
                <p className="text-sm text-muted-foreground">{t('nothingToPay')}</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-card text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">{t('colItem')}</th>
                        <th className="px-3 py-2 text-left font-medium">{t('colDate')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('colAmount')}</th>
                        <th className="px-3 py-2 text-right font-medium">{t('colCommission')}</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {prep.lines.lease_payments.map((l) => (
                        <tr key={`lp-${l.id}`} className="border-t border-border">
                          <td className="px-3 py-2">
                            {t('leaseLine', { reference: l.lease_reference ?? `#${l.lease_id}` })}
                          </td>
                          <td className="px-3 py-2">{l.paid_at ? formatDate(l.paid_at, locale) : '—'}</td>
                          <td className="px-3 py-2 text-right">{money(l.amount)}</td>
                          <td className="px-3 py-2 text-right">
                            {money(l.commission)}{' '}
                            <span className="text-xs text-muted-foreground">
                              {t(l.commission_rate_source === 'lease' ? 'rateFromLease' : 'rateFromAgency', {
                                rate: l.commission_rate,
                              })}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {prep.lines.booking_payments.map((l) => (
                        <tr key={`bp-${l.id}`} className="border-t border-border">
                          <td className="px-3 py-2">
                            {t('bookingLine', { reference: l.booking_reference ?? `#${l.booking_id}` })}
                          </td>
                          <td className="px-3 py-2">{l.paid_at ? formatDate(l.paid_at, locale) : '—'}</td>
                          <td className="px-3 py-2 text-right">{money(l.amount)}</td>
                          <td className="px-3 py-2 text-right">{money(l.commission)}</td>
                        </tr>
                      ))}
                      {prep.lines.service_provider_bills.map((l) => (
                        <tr key={`sb-${l.id}`} className="border-t border-border">
                          <td className="px-3 py-2">
                            {t('billLine', { reference: l.reference_number ?? `#${l.id}` })}
                          </td>
                          <td className="px-3 py-2">—</td>
                          <td className="px-3 py-2 text-right">{money(-l.amount)}</td>
                          <td className="px-3 py-2 text-right">—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <dl className="grid gap-2 rounded-xl bg-card p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ['gross', prep.totals.gross],
                    ['commission', prep.totals.commission],
                    ['fees', prep.totals.fees],
                    ['net', prep.totals.net],
                  ] as const
                ).map(([key, amount]) => (
                  <div key={key}>
                    <dt className="text-muted-foreground">{t(key)}</dt>
                    <dd className="text-right text-sm font-semibold tabular-nums text-foreground">
                      {money(amount)}
                    </dd>
                  </div>
                ))}
              </dl>

              {prep.requires_approval ? (
                <p className="rounded-xl border border-border bg-card p-3 text-sm text-foreground">
                  {t('requiresApproval', { threshold: money(prep.approval_threshold ?? 0) })}
                </p>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="payout-destination">{t('destination')}</Label>
                  <select
                    id="payout-destination"
                    className={SELECT_CLASS}
                    value={payoutMethodId}
                    onChange={(e) => setPayoutMethodId(e.target.value)}
                  >
                    <option value="">{t('destinationNone')}</option>
                    {prep.payout_methods.map((m) => (
                      <option key={m.id} value={String(m.id)}>
                        {t('destinationOption', {
                          kind: tKind(m.kind),
                          masked: m.masked_identifier ?? '',
                          state: m.verified ? t('verified') : t('unverified'),
                        })}
                      </option>
                    ))}
                  </select>
                  {selectedMethod && !selectedMethod.verified ? (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{t('unverifiedHint')}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={verifyMethod.isPending}
                        onClick={() => void verifyDestination(selectedMethod.id)}
                      >
                        {t('verifyDestination')}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payout-method">{t('method')}</Label>
                  <select
                    id="payout-method"
                    className={SELECT_CLASS}
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="">{tMethod('none')}</option>
                    {PAYMENT_METHOD_VALUES.map((value) => (
                      <option key={value} value={value}>
                        {tMethod(value)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payout-scheduled">{t('scheduledAt')}</Label>
                  <Input
                    id="payout-scheduled"
                    type="date"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="payout-notes">{t('notes')}</Label>
                <Textarea id="payout-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">{t('chooseFirst')}</p>
          )}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
              {createPayout.isPending ? t('creating') : t('submit')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
