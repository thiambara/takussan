'use client';

import { useState, useTransition } from 'react';
import { buildExportUrl, type ExportEntity, type ExportFormat } from '@/lib/queries/exports';

type Props = {
  canExportCustomers: boolean;
};

const ENTITY_LABELS: Record<ExportEntity, string> = {
  payments: 'Paiements',
  leases: 'Baux',
  customers: 'Clients',
  properties: 'Biens',
};

export function ExportForm({ canExportCustomers }: Props) {
  const [entity, setEntity] = useState<ExportEntity>('payments');
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleDownload() {
    startTransition(() => {
      const url = buildExportUrl({
        entity,
        format,
        from: from || undefined,
        to: to || undefined,
      });
      // Opening in a new tab keeps the Sanctum cookie attached and preserves the
      // current page so users can run several exports back-to-back.
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    });
  }

  const entities: ExportEntity[] = canExportCustomers
    ? ['payments', 'leases', 'customers', 'properties']
    : ['payments', 'leases', 'properties'];

  return (
    <section className="max-w-xl space-y-4 rounded-2xl bg-app-surface-1 p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-app-ink">Type de données</span>
          <select
            className="rounded-md border border-app-surface-3 bg-white px-3 py-2"
            value={entity}
            onChange={(e) => setEntity(e.target.value as ExportEntity)}
          >
            {entities.map((e) => (
              <option key={e} value={e}>
                {ENTITY_LABELS[e]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-app-ink">Format</span>
          <select
            className="rounded-md border border-app-surface-3 bg-white px-3 py-2"
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
          >
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (xlsx)</option>
            <option value="pdf">PDF</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-app-ink">Du</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-app-surface-3 bg-white px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-app-ink">Au</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-app-surface-3 bg-white px-3 py-2"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isPending}
        className="rounded-md bg-app-topbar px-4 py-2 text-sm font-semibold text-white hover:bg-app-topbar/90 disabled:opacity-60"
      >
        {isPending ? 'Téléchargement…' : 'Télécharger'}
      </button>
      <p className="text-xs text-app-ink-muted">
        Les exports respectent votre rôle (agence, bailleur, locataire) — aucune donnée hors de
        votre périmètre n&apos;est incluse.
      </p>
    </section>
  );
}
