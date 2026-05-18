'use client';

import { useState, useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { KpiConfig } from '@/lib/queries/kpis';
import { createKpiConfigAction, deleteKpiConfigAction } from '@/app/actions/kpis';

const FORMAT_OPTIONS = [
  { value: 'number', label: 'Nombre' },
  { value: 'percent', label: 'Pourcentage' },
  { value: 'currency', label: 'Devise' },
] as const;

type Props = {
  initialConfigs: KpiConfig[];
  catalog: string[];
};

export function KpiConfigList({ initialConfigs, catalog }: Props) {
  const [configs, setConfigs] = useState(initialConfigs);
  const [metric, setMetric] = useState(catalog[0] ?? '');
  const [label, setLabel] = useState('');
  const [format, setFormat] = useState<'number' | 'percent' | 'currency'>('number');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addKpi() {
    if (!metric || !label) {
      setError('Choisissez une métrique et un libellé.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createKpiConfigAction({ metric, label, format });
      if (!res.ok) {
        setError(res.message || 'Erreur lors de la création.');
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

  return (
    <div className="space-y-6">
      <section className="max-w-xl space-y-3 rounded-2xl bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground">Ajouter un KPI</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Métrique</span>
            <Select
              value={metric}
              onValueChange={(value) => setMetric(value ?? '')}
              items={catalog.map((m) => ({ value: m, label: m }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {catalog.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Libellé</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2"
              placeholder="Taux d'impayés"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-foreground">Format</span>
            <Select
              value={format}
              onValueChange={(value) => setFormat((value ?? format) as 'number' | 'percent' | 'currency')}
              items={FORMAT_OPTIONS as unknown as Array<{ value: string; label: string }>}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <button
          type="button"
          onClick={addKpi}
          disabled={isPending}
          className="rounded-md bg-app-topbar px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Ajouter
        </button>
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </section>

      <section className="rounded-2xl bg-card p-6">
        <h2 className="mb-3 text-sm font-semibold text-foreground">KPIs configurés</h2>
        {configs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun KPI configuré.</p>
        ) : (
          <ul className="divide-y divide-app-surface-3">
            {configs.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium text-foreground">{c.label}</span>{' '}
                  <span className="text-muted-foreground">({c.metric})</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeKpi(c.id)}
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
