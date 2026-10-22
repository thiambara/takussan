'use client';

import { useState } from 'react';
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
import {
  buildExportUrl,
  PLAFOND_LIGNES_EXPORT,
  PLAFOND_LIGNES_EXPORT_PDF,
  type ExportEntity,
  type ExportFormat,
} from '@/lib/queries/exports';
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
  const [isPending, setPending] = useState(false);
  const [coupe, setCoupe] = useState<number | null>(null);
  const [echec, setEchec] = useState(false);

  /**
   * TCK-1308 (piste P112.03) — le téléchargement passe par le relais en `fetch`, et non plus par
   * un onglet ouvert : c'est la seule façon de lire `X-Export-Truncated`, que l'API pose quand
   * l'export est coupé au plafond. Le relais est sur l'origine du front : le cookie de session part
   * avec la requête, et `Content-Disposition` se lit (il donne le nom du fichier).
   */
  async function handleDownload() {
    if (!entity) return;
    const url = buildExportUrl({
      entity,
      format,
      from: from || undefined,
      to: to || undefined,
    });
    setPending(true);
    setCoupe(null);
    setEchec(false);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setEchec(true);
        return;
      }
      const tronque = Number(res.headers.get('x-export-truncated'));
      setCoupe(Number.isFinite(tronque) && tronque > 0 ? tronque : null);
      const nom = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `${entity}.${format}`;
      const objectUrl = URL.createObjectURL(await res.blob());
      const lien = document.createElement('a');
      lien.href = objectUrl;
      lien.download = nom;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setEchec(true);
    } finally {
      setPending(false);
    }
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
      <Button type="button" onClick={() => void handleDownload()} disabled={isPending}>
        {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
        {isPending ? t('downloading') : t('download')}
      </Button>
      {/* `scopeNotice` et non `scopeNoticeFull` : cette page est ouverte à l'agence, au bailleur
          et à l'AGENT (`layout.tsx`), jamais au locataire que la version longue nommait. */}
      <p className="text-xs text-pretty text-muted-foreground">{t('scopeNotice')}</p>
      {coupe !== null && (
        <p className="text-sm text-pretty text-foreground" role="status" data-testid="exports-truncated">
          {t('truncated', { count: coupe })}
        </p>
      )}
      {echec && (
        <p className="text-sm text-pretty text-destructive" role="alert">
          {t('failed')}
        </p>
      )}
      {/* TCK-1306 (P112.01) — le plafond de lignes se dit : au-delà, le fichier est coupé. */}
      <p className="text-xs text-pretty text-muted-foreground" data-testid="exports-row-cap">
        {t('rowCap', { max: PLAFOND_LIGNES_EXPORT, pdf: PLAFOND_LIGNES_EXPORT_PDF })}
      </p>
    </section>
  );
}
