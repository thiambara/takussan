'use client';

import { useState, useTransition } from 'react';
import type { KpiConfig } from '@/lib/queries/kpis';
import { createKpiConfigAction, deleteKpiConfigAction } from '@/app/actions/kpis';

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
      <section className="max-w-xl space-y-3 rounded-2xl bg-app-surface-1 p-6">
        <h2 className="text-sm font-semibold text-app-ink">Ajouter un KPI</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-app-ink">Métrique</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="w-full rounded-md border border-app-surface-3 bg-white px-3 py-2"
            >
              {catalog.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-app-ink">Libellé</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border border-app-surface-3 bg-white px-3 py-2"
              placeholder="Taux d'impayés"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-app-ink">Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'number' | 'percent' | 'currency')}
              className="w-full rounded-md border border-app-surface-3 bg-white px-3 py-2"
            >
              <option value="number">Nombre</option>
              <option value="percent">Pourcentage</option>
              <option value="currency">Devise</option>
            </select>
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

      <section className="rounded-2xl bg-app-surface-1 p-6">
        <h2 className="mb-3 text-sm font-semibold text-app-ink">KPIs configurés</h2>
        {configs.length === 0 ? (
          <p className="text-sm text-app-ink-muted">Aucun KPI configuré.</p>
        ) : (
          <ul className="divide-y divide-app-surface-3">
            {configs.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium text-app-ink">{c.label}</span>{' '}
                  <span className="text-app-ink-muted">({c.metric})</span>
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
