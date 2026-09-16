'use client';

import { useState, useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Gauge, Loader2, Plus, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { KpiConfig } from '@/lib/queries/kpis';
import { createKpiConfigAction, deleteKpiConfigAction } from '@/app/actions/kpis';
import { useTranslations } from 'next-intl';

const FORMAT_VALUES = ['number', 'percent', 'currency'] as const;
type KpiFormat = (typeof FORMAT_VALUES)[number];

/** Les métriques du catalogue de l'API (`KpiConfig::METRICS`) qui ont un libellé. */
const METRIQUES_NOMMEES = new Set([
  'properties_total', 'properties_rented', 'properties_available', 'leases_active',
  'customers_count', 'members_count', 'bookings_pending', 'maintenance_open', 'revenue_month',
  'commission_month', 'overdue_count', 'overdue_amount', 'unpaid_rate_percent',
  'occupancy_rate_percent',
]);

type Props = {
  initialConfigs: KpiConfig[];
  catalog: string[];
};

export function KpiConfigList({ initialConfigs, catalog }: Props) {
  const t = useTranslations('dashboard.kpis');
  const [configs, setConfigs] = useState(initialConfigs);
  const [metric, setMetric] = useState(catalog[0] ?? '');
  const [label, setLabel] = useState('');
  const [format, setFormat] = useState<KpiFormat>('number');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addKpi() {
    if (!metric || !label) {
      setError(t('validation'));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createKpiConfigAction({ metric, label, format });
      if (!res.ok) {
        setError(res.message || t('createError'));
        return;
      }
      setConfigs((prev) => [...prev, res.data]);
      setLabel('');
    });
  }

  function removeKpi(id: number) {
    startTransition(async () => {
      const res = await deleteKpiConfigAction(id);
      if (res.ok) setConfigs((prev) => prev.filter((c) => c.id !== id));
    });
  }

  // Le catalogue arrive en CODES (`properties_total`) : le front les traduit, et garde le code
  // pour une métrique que ce fichier ne connaît pas encore plutôt que de l'effacer.
  const libelleMetrique = (code: string) =>
    METRIQUES_NOMMEES.has(code) ? t(`metrics.${code}`) : code;
  const metricItems = catalog.map((m) => ({ value: m, label: libelleMetrique(m) }));
  const formatItems = FORMAT_VALUES.map((v) => ({ value: v, label: t(`formats.${v}`) }));

  return (
    <div className="space-y-6">
      {/* Même largeur que la liste en dessous : la carte de saisie bornée à `max-w-xl` flottait
          à gauche d'une liste pleine largeur. Les colonnes se posent dès `lg` (TCK-505). */}
      <section className="space-y-4 rounded-2xl bg-card p-6">
        <h2 className="text-base font-semibold text-foreground">{t('addTitle')}</h2>
        <form
          className="grid gap-3 lg:grid-cols-[1fr_1fr_12rem_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            addKpi();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="kpi-metric">{t('metric')}</Label>
            <Select
              value={metric}
              onValueChange={(value) => setMetric(value ?? '')}
              items={metricItems}
            >
              <SelectTrigger id="kpi-metric" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {metricItems.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kpi-label">{t('label')}</Label>
            <Input
              id="kpi-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('labelPlaceholder')}
              aria-invalid={error !== null && !label ? true : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kpi-format">{t('format')}</Label>
            <Select
              value={format}
              onValueChange={(value) => setFormat((value ?? format) as KpiFormat)}
              items={formatItems}
            >
              <SelectTrigger id="kpi-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formatItems.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={isPending} className="justify-self-start">
            {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {t('add')}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">{t('configured')}</h2>
        {configs.length === 0 ? (
          <EmptyState
            icon={<Gauge className="size-8" aria-hidden="true" />}
            title={t('empty')}
            description={t('emptyDescription')}
          />
        ) : (
          <ul className="divide-y divide-border">
            {configs.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{c.label}</span>{' '}
                  <span className="text-muted-foreground">({libelleMetrique(c.metric)})</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeKpi(c.id)}
                  disabled={isPending}
                  aria-label={t('deleteAria', { label: c.label })}
                  className="shrink-0 text-destructive hover:text-destructive"
                >
                  <Trash2 aria-hidden="true" />
                  {t('delete')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
