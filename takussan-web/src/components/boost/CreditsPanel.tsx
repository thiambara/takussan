'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { DataState, DataTable, Pagination, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { useCredits } from './api';
import type { CreditMovement } from './types';

/** TCK-633 lot F (ADR-0061 §1, §2) — le solde de l'espace, ses lots vivants et son historique. */
export function CreditsPanel() {
  const t = useTranslations('credits');
  const f = useFormatteurs();
  const [page, setPage] = useState(1);
  const credits = useCredits(true, page);
  const donnees = credits.data;

  // TCK-825 (P24.03) — une dépense ou un remboursement de boost dit le bien et l'offre.
  const objet = (m: CreditMovement) => {
    if (!m.boost) return '—';
    const offre = m.boost.kind === 'badge'
      ? t(`movements.offers.badge.${m.boost.variant ?? 'urgent'}`)
      : t(`movements.offers.${m.boost.kind}`);
    return m.boost.property ? t('movements.object', { offer: offre, property: m.boost.property.title }) : offre;
  };

  const colonnes: DataTableColumn<CreditMovement>[] = [
    { id: 'date', header: t('movements.colDate'), cell: (m) => f.dateTime(m.created_at) },
    { id: 'type', header: t('movements.colType'), cell: (m) => t(`types.${m.type}`) },
    { id: 'amount', header: t('movements.colAmount'), align: 'end', cell: (m) => <span className="tabular-nums">{m.amount > 0 ? `+${m.amount}` : String(m.amount)}</span> },
    { id: 'object', header: t('movements.colObject'), cell: objet },
    { id: 'reason', header: t('movements.colReason'), cell: (m) => m.reason ?? '—' },
  ];

  return (
    <DataState
      loading={credits.isLoading}
      error={credits.isError ? t('loadError') : null}
      onRetry={() => void credits.refetch()}
      retryLabel={t('retry')}
    >
      <div className="space-y-8">
        <section aria-labelledby="credits-solde" className="rounded-xl border border-border bg-card p-6">
          <h2 id="credits-solde" className="text-sm font-medium text-muted-foreground">{t('balance')}</h2>
          <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-foreground">
            {t('balanceValue', { count: donnees?.data.balance ?? 0 })}
          </p>
        </section>

        <section aria-labelledby="credits-lots" className="space-y-3">
          <h2 id="credits-lots" className="font-display text-xl font-semibold text-foreground">{t('lots.title')}</h2>
          {donnees && donnees.data.lots.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {donnees.data.lots.map((lot) => (
                <li key={lot.id} className="rounded-lg border border-border bg-card p-4">
                  <p className="font-medium text-foreground">{t(`origins.${lot.origin}`)}</p>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {t('lots.remaining', { remaining: lot.remaining_amount, initial: lot.initial_amount })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {lot.expires_at ? t('lots.expires', { date: f.date(lot.expires_at) }) : t('lots.noExpiry')}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={t('lots.empty')} />
          )}
        </section>

        <section aria-labelledby="credits-historique" className="space-y-3">
          <h2 id="credits-historique" className="font-display text-xl font-semibold text-foreground">{t('movements.title')}</h2>
          {donnees && donnees.movements.length > 0 ? (
            <>
              <DataTable caption={t('movements.caption')} columns={colonnes} rows={donnees.movements} rowKey={(m) => m.id} />
              <Pagination page={donnees.meta.current_page} lastPage={donnees.meta.last_page} onChange={setPage} />
            </>
          ) : (
            <EmptyState title={t('movements.empty')} />
          )}
        </section>
      </div>
    </DataState>
  );
}
