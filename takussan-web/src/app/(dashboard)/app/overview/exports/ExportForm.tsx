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
import { useCan } from '@/hooks/useCan';
import { useTranslations } from 'next-intl';

type Props = {
  /** Personnel d'une agence (agent, admin) : ses exports sont jugés par capacité. */
  staff: boolean;
};

const FORMATS: readonly ExportFormat[] = ['csv', 'xlsx', 'pdf'];

/**
 * TCK-587 (ADR-0031 §2) — la capacité qui ouvre chaque export au PERSONNEL, comme
 * `ExportController::CAPABILITY`. Le bailleur n'en tient aucune : il exporte ses paiements, ses
 * baux et ses biens, jamais les clients de l'agence.
 */
const CAPACITE: Record<ExportEntity, string> = {
  payments: 'payments.export',
  leases: 'reports.export',
  customers: 'crm.export',
  properties: 'reports.export',
  // TCK-595 (§7) — les exports financiers : au personnel seul, jamais au bailleur.
  payouts: 'reports.export',
  invoices: 'reports.export',
  commissions: 'reports.export',
  aging: 'reports.export',
  deposits: 'reports.export',
};
const TOUTES: readonly ExportEntity[] = [
  'payments',
  'leases',
  'customers',
  'properties',
  'payouts',
  'invoices',
  'commissions',
  'aging',
  'deposits',
];
const DU_BAILLEUR: readonly ExportEntity[] = ['payments', 'leases', 'properties'];

export function ExportForm({ staff }: Props) {
  const t = useTranslations('dashboard.exports');
  const tenues: Record<string, boolean> = {
    'payments.export': useCan('payments.export').can,
    'reports.export': useCan('reports.export').can,
    'crm.export': useCan('crm.export').can,
  };
  const entities = staff ? TOUTES.filter((e) => tenues[CAPACITE[e]]) : DU_BAILLEUR;
  const [choix, setEntity] = useState<ExportEntity>('payments');
  // Le choix par défaut peut ne pas être offert (un rôle sans `payments.export`).
  const entity = entities.includes(choix) ? choix : entities[0];
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleDownload() {
    if (!entity) return;
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

  if (entities.length === 0) {
    return (
      <p className="max-w-xl rounded-2xl bg-card p-6 text-sm text-pretty text-muted-foreground" data-testid="exports-none">
        {t('noneAllowed')}
      </p>
    );
  }

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
