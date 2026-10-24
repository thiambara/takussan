'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { DataState } from '@/components/console';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { decalerJour, jourDeLApi } from '@/lib/jour-de-l-api';
import { fetchBoostStats, type BoostStatsRow } from './api';

function jour(decalage: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
}

/** `passedValidation` de `BoostStatsRequest` : 92 jours au plus entre « du » et « au ». */
const FENETRE_MAX_JOURS = 92;

/** TCK-633 lot F (ADR-0061 §10) — impressions, clics et taux de clic des emplacements. */
export function AdminBoostStats() {
  const t = useTranslations('superAdmin.boosts.stats');
  const tBoosts = useTranslations('superAdmin.boosts');
  const f = useFormatteurs();
  const [saisie, setSaisie] = useState({ from: jour(-29), to: jour(0) });
  const [fenetre, setFenetre] = useState(saisie);
  // P230.05 — `to` `after_or_equal:from` et `before_or_equal:` demain (jour de l'API).
  const [demain] = useState(() => decalerJour(jourDeLApi(), 1));
  const auMax =
    saisie.from && decalerJour(saisie.from, FENETRE_MAX_JOURS) < demain
      ? decalerJour(saisie.from, FENETRE_MAX_JOURS)
      : demain;
  const stats = useQuery({ queryKey: ['super-admin', 'boost-stats', fenetre], queryFn: () => fetchBoostStats(fenetre) });
  const pourcent = (x: number) => f.nombre(x, { style: 'percent', maximumFractionDigits: 2 });

  const colonnes: DataTableColumn<BoostStatsRow>[] = [
    { id: 'date', header: t('colDate'), cell: (r) => f.date(r.date) },
    { id: 'impressions', header: t('impressions'), align: 'end', cell: (r) => <span className="tabular-nums">{f.nombre(r.impressions)}</span> },
    { id: 'clicks', header: t('clicks'), align: 'end', cell: (r) => <span className="tabular-nums">{f.nombre(r.clicks)}</span> },
    { id: 'ctr', header: t('ctr'), align: 'end', cell: (r) => <span className="tabular-nums">{pourcent(r.ctr)}</span> },
  ];
  const totaux = stats.data?.totals;

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setFenetre(saisie);
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="stats-du">{t('from')}</Label>
          <Input
            id="stats-du"
            type="date"
            min={saisie.to ? decalerJour(saisie.to, -FENETRE_MAX_JOURS) : undefined}
            max={saisie.to || undefined}
            value={saisie.from} onChange={(e) => setSaisie({ ...saisie, from: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="stats-au">{t('to')}</Label>
          <Input
            id="stats-au"
            type="date"
            min={saisie.from || undefined}
            max={auMax}
            value={saisie.to} onChange={(e) => setSaisie({ ...saisie, to: e.target.value })} />
        </div>
        <Button type="submit" variant="outline">{t('apply')}</Button>
      </form>

      <DataState
        loading={stats.isLoading}
        error={stats.isError ? t('loadError') : null}
        onRetry={() => void stats.refetch()}
        retryLabel={tBoosts('retry')}
        isEmpty={(stats.data?.data.length ?? 0) === 0}
        emptyState={<EmptyState title={t('empty')} />}
      >
        {totaux ? (
          <dl className="grid gap-3 sm:grid-cols-3">
            {([['impressions', f.nombre(totaux.impressions)], ['clicks', f.nombre(totaux.clicks)], ['ctr', pourcent(totaux.ctr)]] as const).map(([cle, valeur]) => (
              <div key={cle} className="rounded-xl border border-border bg-card p-4">
                <dt className="text-sm text-muted-foreground">{t(cle)}</dt>
                <dd className="font-display text-2xl font-semibold tabular-nums text-foreground">{valeur}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <DataTable caption={t('caption')} columns={colonnes} rows={stats.data?.data ?? []} rowKey={(r) => r.date} />
      </DataState>
    </div>
  );
}
