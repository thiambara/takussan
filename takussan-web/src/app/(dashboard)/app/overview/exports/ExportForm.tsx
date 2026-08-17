'use client';

import { useState, useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { buildExportUrl, type ExportEntity, type ExportFormat } from '@/lib/queries/exports';
import { useTranslations } from 'next-intl';

type Props = {
  canExportCustomers: boolean;
};

const ENTITY_LABELS: Record<ExportEntity, string> = {
  payments: 'Paiements',
  leases: 'Baux',
  customers: 'Clients',
  properties: 'Biens',
};

const FORMAT_OPTIONS: ReadonlyArray<{ value: ExportFormat; label: string }> = [
  { value: 'csv', label: 'CSV' },
  { value: 'xlsx', label: 'Excel (xlsx)' },
  { value: 'pdf', label: 'PDF' },
];

export function ExportForm({ canExportCustomers }: Props) {
  const t = useTranslations('dashboard.exports');
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
    <section className="max-w-xl space-y-4 rounded-2xl bg-card p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t('dataType')}</span>
          <Select
            value={entity}
            onValueChange={(value) => setEntity((value ?? 'payments') as ExportEntity)}
            items={entities.map((e) => ({ value: e, label: ENTITY_LABELS[e] }))}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entities.map((e) => (
                <SelectItem key={e} value={e}>
                  {ENTITY_LABELS[e]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t('format')}</span>
          <Select
            value={format}
            onValueChange={(value) => setFormat((value ?? 'csv') as ExportFormat)}
            items={FORMAT_OPTIONS}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t('from')}</span>
          <DatePicker value={from} onValueChange={setFrom} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t('to')}</span>
          <DatePicker value={to} onValueChange={setTo} />
        </label>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={isPending}
        className="rounded-md bg-app-topbar px-4 py-2 text-sm font-semibold text-white hover:bg-app-topbar/90 disabled:opacity-60"
      >
        {isPending ? t('downloading') : t('download')}
      </button>
      <p className="text-xs text-muted-foreground">{t('scopeNoticeFull')}</p>
    </section>
  );
}
