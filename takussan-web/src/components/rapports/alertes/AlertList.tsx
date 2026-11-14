'use client';

import { useState, useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BellRing, Loader2, Plus, Trash2 } from 'lucide-react';

import { StatusBadge, type StatusTone } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ThresholdAlert } from '@/lib/queries/alerts';
import { createThresholdAlertAction, deleteThresholdAlertAction } from '@/app/actions/alerts';
import { useTranslations } from 'next-intl';

/** La valeur envoyée à l'API, et la clé de son libellé (`>` n'est pas une clé de dictionnaire). */
const OPERATORS = [
  { value: '>', key: 'gt' },
  { value: '>=', key: 'gte' },
  { value: '<', key: 'lt' },
  { value: '<=', key: 'lte' },
] as const;

const SEVERITIES = ['info', 'warning', 'critical'] as const;
type Severity = (typeof SEVERITIES)[number];

/** Le ton de pastille de chaque sévérité — la table de la console, pas une couleur locale. */
const SEVERITY_TONE: Record<Severity, StatusTone> = {
  info: 'info',
  warning: 'attention',
  critical: 'danger',
};

const SYMBOLE: Record<string, string> = { '>': '>', '>=': '≥', '<': '<', '<=': '≤' };

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
  // Les six métriques d'alerte sont un sous-ensemble du catalogue des KPI : un seul vocabulaire.
  const tMetric = useTranslations('dashboard.kpis.metrics');
  const [alerts, setAlerts] = useState(initialAlerts);
  const [metric, setMetric] = useState<(typeof ALERT_METRICS)[number]>('unpaid_rate_percent');
  const [operator, setOperator] = useState<'>' | '<' | '>=' | '<='>('>');
  const [threshold, setThreshold] = useState('10');
  const [severity, setSeverity] = useState<Severity>('warning');
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

  const metricItems = ALERT_METRICS.map((m) => ({ value: m, label: tMetric(m) }));
  const operatorItems = OPERATORS.map((o) => ({ value: o.value, label: t(`operators.${o.key}`) }));
  const severityItems = SEVERITIES.map((v) => ({ value: v, label: t(`severities.${v}`) }));
  const libelleMetrique = (code: string) =>
    (ALERT_METRICS as readonly string[]).includes(code) ? tMetric(code) : code;
  const estSeverite = (v: string): v is Severity => (SEVERITIES as readonly string[]).includes(v);

  return (
    <div className="space-y-6">
      {/* Même largeur que la liste ; primitives du système (`Input`, `Label`, `Button`) au lieu
          d'un `<input>` natif de 38 px à côté de `Select` de 32, et d'un bouton sombre qui
          n'était pas le bouton principal du produit. */}
      <section className="space-y-4 rounded-2xl bg-card p-6">
        <h2 className="text-base font-semibold text-foreground">{t('addTitle')}</h2>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            addAlert();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="alert-metric">{t('metric')}</Label>
              <Select
                value={metric}
                onValueChange={(value) => setMetric((value ?? metric) as (typeof ALERT_METRICS)[number])}
                items={metricItems}
              >
                <SelectTrigger id="alert-metric" className="w-full">
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
              <Label htmlFor="alert-operator">{t('operator')}</Label>
              <Select
                value={operator}
                onValueChange={(value) => setOperator((value ?? operator) as typeof operator)}
                items={operatorItems}
              >
                <SelectTrigger id="alert-operator" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {operatorItems.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-threshold">{t('threshold')}</Label>
              <Input
                id="alert-threshold"
                type="number"
                inputMode="decimal"
                // Sans `step`, le `<form>` refuse 7.5 à l'Entrée (pas implicite de 1) — l'API
                // accepte tout `numeric`.
                step="any"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-severity">{t('severity')}</Label>
              <Select
                value={severity}
                onValueChange={(value) => setSeverity((value ?? severity) as Severity)}
                items={severityItems}
              >
                <SelectTrigger id="alert-severity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {severityItems.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-cooldown">{t('cooldown')}</Label>
              <Input
                id="alert-cooldown"
                type="number"
                min="1"
                max="720"
                inputMode="numeric"
                value={cooldownHours}
                onChange={(e) => setCooldownHours(e.target.value)}
                aria-describedby="alert-cooldown-hint"
                className="tabular-nums"
              />
              <p id="alert-cooldown-hint" className="text-xs text-pretty text-muted-foreground">
                {t('cooldownHint')}
              </p>
            </div>
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {t('create')}
          </Button>
        </form>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">{t('activeTitle')}</h2>
        {alerts.length === 0 ? (
          <EmptyState
            icon={<BellRing className="size-8" aria-hidden="true" />}
            title={t('empty')}
            description={t('emptyDescription')}
          />
        ) : (
          <ul className="divide-y divide-border">
            {alerts.map((a) => {
              const libelle = `${libelleMetrique(a.metric)} ${SYMBOLE[a.operator] ?? a.operator} ${a.threshold}`;
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-foreground">{libelleMetrique(a.metric)}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {SYMBOLE[a.operator] ?? a.operator} {a.threshold}
                    </span>
                    <StatusBadge
                      label={estSeverite(a.severity) ? t(`severities.${a.severity}`) : a.severity}
                      tone={estSeverite(a.severity) ? SEVERITY_TONE[a.severity] : 'neutral'}
                    />
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeAlert(a.id)}
                    disabled={isPending}
                    aria-label={t('deleteAria', { label: libelle })}
                    className="shrink-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                    {t('delete')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
