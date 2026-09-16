'use client';

import { useState, useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { buildExportUrl, type ExportEntity, type ExportFormat } from '@/lib/queries/exports';
import { useTranslations } from 'next-intl';

type Props = {
  canExportCustomers: boolean;
};

const FORMATS: readonly ExportFormat[] = ['csv', 'xlsx', 'pdf'];

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
  // Libellés du dictionnaire : la table française en dur s'affichait telle quelle en anglais.
  const entityItems = entities.map((e) => ({ value: e, label: t(`entities.${e}`) }));
  const formatItems = FORMATS.map((f) => ({ value: f, label: t(`formats.${f}`) }));

  return (
    <section className="max-w-xl space-y-4 rounded-2xl bg-card p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">{t('dataType')}</span>
          <Select
            value={entity}
            onValueChange={(value) => setEntity((value ?? 'payments') as ExportEntity)}
            items={entityItems}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {entityItems.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
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
            items={formatItems}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {formatItems.map((opt) => (
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
      {/* Le bouton principal du produit (`bg-primary`), plus un aplat sombre fait main. */}
      <Button type="button" onClick={handleDownload} disabled={isPending}>
        {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
        {isPending ? t('downloading') : t('download')}
      </Button>
      {/* `scopeNotice` et non `scopeNoticeFull` : cette page est ouverte à l'agence, au bailleur
          et à l'AGENT (`layout.tsx`), jamais au locataire que la version longue nommait. */}
      <p className="text-xs text-pretty text-muted-foreground">{t('scopeNotice')}</p>
    </section>
  );
}
