'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { useDepositRefundState } from '@/lib/queries/leases';
import type { Locale } from '@/i18n/config';
import type { Lease } from '@/types/lease';
import { DepositRefundModal } from './DepositRefundModal';

interface DepositRefundBannerProps {
  readonly lease: Pick<Lease, 'id' | 'status' | 'deposit_amount' | 'currency'>;
  /** When true, renders the action button (only for users with refund capability). */
  readonly canRefund: boolean;
}

/**
 * TCK-088 — Bandeau "Caution" affiché sur la fiche bail terminée/expirée.
 *
 * Trois états visuels :
 *  - none    → orange    (caution intacte, à rembourser)
 *  - partial → ambre     (déjà partiellement rembourée, retenue documentée)
 *  - full    → vert      (intégralement remboursée, lecture seule)
 *
 * On masque entièrement le bandeau pour les baux en cours — c'est dans la
 * carte "Caution" du grid principal qu'on lit le montant initial.
 */
export function DepositRefundBanner({ lease, canRefund }: DepositRefundBannerProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('lease.deposit');
  const [open, setOpen] = useState(false);

  const eligible = lease.status === 'terminated' || lease.status === 'expired';
  const hasDeposit = (lease.deposit_amount ?? 0) > 0;
  const { data } = useDepositRefundState(eligible && hasDeposit ? lease.id : null);

  if (!eligible || !hasDeposit) return null;

  const state = data?.data;
  const status = state?.state ?? 'none';

  const palette =
    status === 'full'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : status === 'partial'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-orange-200 bg-orange-50 text-orange-900';

  const label = t(`banner.${status}_title`);

  return (
    <>
      <section
        data-testid="deposit-refund-banner"
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm ${palette}`}
      >
        <div className="space-y-1">
          <p className="font-semibold">{label}</p>
          {state && status !== 'none' && (
            <p className="text-xs">
              {t('banner.refunded_summary', {
                refunded: formatCurrency(state.deposit_refunded_amount, locale),
                total: formatCurrency(state.deposit_amount, locale),
                date: state.deposit_refunded_at
                  ? formatDate(state.deposit_refunded_at, locale)
                  : '—',
              })}
            </p>
          )}
          {state?.deposit_refund_reason && status === 'partial' && (
            <p className="text-xs italic">
              {t('banner.reason_prefix')}: {state.deposit_refund_reason}
            </p>
          )}
        </div>
        {canRefund && status !== 'full' && (
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            {status === 'partial' ? t('banner.continue_cta') : t('banner.cta')}
          </Button>
        )}
      </section>
      {state && (
        <DepositRefundModal
          open={open}
          onOpenChange={setOpen}
          leaseId={lease.id}
          depositRemaining={state.deposit_remaining}
          currency={lease.currency ?? 'XOF'}
        />
      )}
    </>
  );
}
