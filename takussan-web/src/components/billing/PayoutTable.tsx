'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PlatformPayout, PlatformPayoutStatus } from '@/types/super-admin';

/**
 * ⚠ La table de LIBELLÉS qui vivait ici a été retirée par TCK-292 : les statuts se résolvent sous
 * `billing.platformPayouts.status.*`, la clé étant la valeur d'enum. Ce qui reste est la TEINTE,
 * qui n'est pas du texte.
 */
const STATUS_TONE: Record<PlatformPayoutStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-blue-50 text-blue-800 ring-blue-200',
  processing: 'bg-violet-50 text-violet-800 ring-violet-200',
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  failed: 'bg-red-50 text-red-800 ring-red-200',
  cancelled: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
};

export function PayoutStatusPill({ status }: { status: PlatformPayoutStatus }) {
  const tStatus = useTranslations('billing.platformPayouts.status');
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_TONE[status]}`}>
      {tStatus(status)}
    </span>
  );
}

export function formatXof(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount.toLocaleString('fr-FR')} ${currency}`;
  }
}

export function PayoutTable({
  payouts,
  isLoading,
  onSelect,
  emptyHint,
}: {
  payouts: PlatformPayout[];
  isLoading?: boolean;
  onSelect?: (payout: PlatformPayout) => void;
  emptyHint?: string;
}) {
  // Hooks AVANT toute sortie anticipée (React Compiler, ADR-0015).
  const t = useTranslations('billing.platformPayouts.table');

  if (isLoading) return <Skeleton className="h-60 rounded-xl" />;

  if (payouts.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {emptyHint ?? t('empty')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">{t('period')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('agency')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('gross')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('commission')}</th>
                <th className="px-4 py-2 text-right font-medium">{t('net')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('status')}</th>
                <th className="px-4 py-2 text-left font-medium">{t('paidOn')}</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr
                  key={payout.id}
                  onClick={() => onSelect?.(payout)}
                  className={`border-b border-border/40 last:border-b-0 ${onSelect ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                >
                  <td className="px-4 py-2">
                    <span className="font-medium text-foreground">{formatPeriod(payout)}</span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">#{payout.agency_id}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatXof(payout.gross_amount, payout.currency)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    -{formatXof(payout.platform_fee_amount, payout.currency)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {formatXof(payout.net_amount, payout.currency)}
                  </td>
                  <td className="px-4 py-2"><PayoutStatusPill status={payout.status} /></td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {payout.processed_at ? new Date(payout.processed_at).toLocaleDateString('fr-FR') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function formatPeriod(payout: PlatformPayout): string {
  const end = payout.period_end ? new Date(payout.period_end).toLocaleDateString('fr-FR') : '—';
  const start = payout.period_start ? new Date(payout.period_start).toLocaleDateString('fr-FR') : '—';
  return `${start} → ${end}`;
}
