'use client';

import { useState, useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ThresholdAlert } from '@/lib/queries/alerts';
import { createThresholdAlertAction, deleteThresholdAlertAction } from '@/app/actions/alerts';
import { useTranslations } from 'next-intl';

const OPERATOR_OPTIONS = [
  { value: '>', label: '>' },
  { value: '>=', label: '>=' },
  { value: '<', label: '<' },
  { value: '<=', label: '<=' },
] as const;

const SEVERITY_OPTIONS = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Attention' },
  { value: 'critical', label: 'Critique' },
] as const;

const ALERT_METRICS = [
  'unpaid_rate_percent',
  'occupancy_rate_percent',
  'overdue_count',
  'overdue_amount',
  'bookings_pending',
  'maintenance_open',
] as const;

type Props = {
  initialAlerts: ThresholdAlert[];
};

export function AlertList({ initialAlerts }: Props) {
  const t = useTranslations('dashboard.alerts');
  const [alerts, setAlerts] = useState(initialAlerts);
  const [metric, setMetric] = useState<(typeof ALERT_METRICS)[number]>('unpaid_rate_percent');
  const [operator, setOperator] = useState<'>' | '<' | '>=' | '<='>('>');
  const [threshold, setThreshold] = useState('10');
  const [severity, setSeverity] = useState<'info' | 'warning' | 'critical'>('warning');
  const [cooldownHours, setCooldownHours] = useState('24');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addAlert() {
    setError(null);
    startTransition(async () => {
      const parsed = Number(threshold);
      if (Number.isNaN(parsed)) {
        setError(t('invalidThreshold'));
        return;
      }
      const res = await createThresholdAlertAction({
        metric,
        operator,
        threshold: parsed,
        severity,
        cooldown_hours: Number(cooldownHours) || 24,
      });
      if (!res.ok) {
        setError(res.message || t('createError'));
        return;
      }
      setAlerts((prev) => [res.data, ...prev]);
    });
  }

  function removeAlert(id: number) {
    startTransition(async () => {
      const res = await deleteThresholdAlertAction(id);
      if (res.ok) setAlerts((prev) => prev.filter((a) => a.id !== id));
    });
  }

  return (
    <div className="space-y-6">
      <section className="max-w-2xl space-y-3 rounded-2xl bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">{t('addTitle')}</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">{t('metric')}</span>
            <Select
              value={metric}
              onValueChange={(value) => setMetric((value ?? metric) as (typeof ALERT_METRICS)[number])}
              items={ALERT_METRICS.map((m) => ({ value: m, label: m }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALERT_METRICS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">{t('operator')}</span>
            <Select
              value={operator}
              onValueChange={(value) => setOperator((value ?? operator) as typeof operator)}
              items={OPERATOR_OPTIONS as unknown as Array<{ value: string; label: string }>}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATOR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">{t('threshold')}</span>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">{t('severity')}</span>
            <Select
              value={severity}
              onValueChange={(value) => setSeverity((value ?? severity) as typeof severity)}
              items={SEVERITY_OPTIONS as unknown as Array<{ value: string; label: string }>}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">{t('cooldown')}</span>
            <input
              type="number"
              min="1"
              max="720"
              value={cooldownHours}
              onChange={(e) => setCooldownHours(e.target.value)}
              className="w-full rounded-md border border-border bg-card px-3 py-2"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={addAlert}
          disabled={isPending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {t('create')}
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </section>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t('activeTitle')}</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium text-foreground">{a.metric}</span>{' '}
                  <span className="text-muted-foreground">
                    {a.operator} {a.threshold}
                  </span>{' '}
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">
                    {a.severity}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => removeAlert(a.id)}
                  className="text-xs text-destructive hover:underline"
                >
                  {t('delete')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
