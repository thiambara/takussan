'use client';

import { useState, useTransition } from 'react';
import type { ThresholdAlert } from '@/lib/queries/alerts';
import { createThresholdAlertAction, deleteThresholdAlertAction } from '@/app/actions/alerts';

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
        setError('Seuil invalide.');
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
        setError(res.message || 'Erreur lors de la création.');
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
        <h2 className="text-sm font-semibold text-foreground">Ajouter une alerte</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Métrique</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as (typeof ALERT_METRICS)[number])}
              className="w-full rounded-md border border-border bg-white px-3 py-2"
            >
              {ALERT_METRICS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Opérateur</span>
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value as typeof operator)}
              className="w-full rounded-md border border-border bg-white px-3 py-2"
            >
              <option value=">">&gt;</option>
              <option value=">=">&gt;=</option>
              <option value="<">&lt;</option>
              <option value="<=">&lt;=</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Seuil</span>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Sévérité</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as typeof severity)}
              className="w-full rounded-md border border-border bg-white px-3 py-2"
            >
              <option value="info">Info</option>
              <option value="warning">Attention</option>
              <option value="critical">Critique</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Cooldown (h)</span>
            <input
              type="number"
              min="1"
              max="720"
              value={cooldownHours}
              onChange={(e) => setCooldownHours(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={addAlert}
          disabled={isPending}
          className="rounded-md bg-app-topbar px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Créer l&apos;alerte
        </button>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </section>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Alertes actives</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune alerte configurée.</p>
        ) : (
          <ul className="divide-y divide-app-surface-3">
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
                  className="text-xs text-rose-600 hover:underline"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
