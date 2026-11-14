'use client';

import { useId, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { PuceDeFiltre } from '@/components/ui/puce-de-filtre';
import {
  PLAFOND_LIGNES_EXPORT,
  PLAFOND_LIGNES_EXPORT_PDF,
  type ExportEntity,
  type ExportFormat,
} from '@/lib/queries/exports';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { PREREGLAGES, bornesDuPrereglage, prereglageDe } from '@/lib/rapports/exports';
import { cn } from '@/lib/utils';

import { Segmente } from '../Segmente';
import { useExportsPermis, useTelechargement } from './useExports';

interface ExportFormProps {
  /** Personnel d'une agence (agent, admin) : ses exports sont jugés par capacité. */
  readonly staff: boolean;
  /** L'export d'un téléphone : le PDF y est recommandé (« se lit le mieux sur place »). */
  readonly telephone?: boolean;
  readonly className?: string;
}

const FORMATS: readonly ExportFormat[] = ['csv', 'xlsx', 'pdf'];

/**
 * L'export personnalisé (TCK-032 P2, TCK-587, TCK-1306, TCK-1308), refait par TCK-2629 sur la maquette
 * `app-rapports` (« Export personnalisé ») : le type en puces, le format, la période avec ses préréglages
 * (« Mois dernier · Ce mois · Année ») et ses deux dates, et les limites dites AVANT l'échec.
 *
 * Les types offerts sont ceux que les cartes prêtes et « Refaire » lisent aussi (`useExportsPermis`) ;
 * le téléchargement passe par le même relais (`useTelechargement`), nom de fichier rendu par l'API et
 * coupure au plafond (`X-Export-Truncated`) comprise.
 */
export function ExportForm({ staff, telephone = false, className }: ExportFormProps) {
  const t = useTranslations('dashboard.exports');
  const tR = useTranslations('rapports.exports');
  // TCK-2795 — les plafonds et le compte coupé groupent par U+00A0, comme les montants : formatés ici,
  // jamais par `{x, number}` (next-intl grouperait par l'espace fine U+202F).
  const f = useFormatteurs();
  const entities = useExportsPermis(staff);
  const [choix, setEntity] = useState<ExportEntity>('payments');
  // Le choix par défaut peut ne pas être offert (un rôle sans `payments.export`).
  const entity = entities.includes(choix) ? choix : entities[0];
  const [format, setFormat] = useState<ExportFormat>(telephone ? 'pdf' : 'xlsx');
  const [periode, setPeriode] = useState(() => bornesDuPrereglage('moisDernier'));
  const telechargement = useTelechargement();
  const idType = useId();
  const idFormat = useId();
  const idPeriode = useId();

  if (entities.length === 0 || !entity) {
    return (
      <p className={cn('text-sm text-pretty text-muted-foreground', className)} data-testid="exports-none">
        {t('noneAllowed')}
      </p>
    );
  }

  const actif = prereglageDe(periode);
  const enCours = telechargement.enCours === 'formulaire';

  return (
    <div className={cn('space-y-4', className)} data-slot="export-personnalise">
      <div role="group" aria-labelledby={idType}>
        <p id={idType} className="mb-1.5 text-sm font-medium text-foreground">
          {t('dataType')}
        </p>
        <div className="flex flex-wrap gap-2">
          {entities.map((e) => (
            <PuceDeFiltre key={e} active={e === entity} onClick={() => setEntity(e)}>
              {t(`entities.${e}`)}
            </PuceDeFiltre>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-pretty text-muted-foreground">{t('scopeNotice')}</p>
      </div>
      <div>
        <p id={idFormat} className="mb-1.5 text-sm font-medium text-foreground">
          {t('format')}
        </p>
        {/* TCK-2801 — un format, et un seul : le contrôle segmenté de la maquette, plus des puces. */}
        <Segmente idDuLibelle={idFormat} valeur={format} onChange={setFormat} options={FORMATS.map((f) => ({ valeur: f, libelle: t(`formats.${f}`) }))} />
        {telephone ? <p className="mt-1.5 text-xs text-pretty text-muted-foreground">{tR('pdfAuTelephone')}</p> : null}
      </div>
      <div role="group" aria-labelledby={idPeriode}>
        <p id={idPeriode} className="mb-1.5 text-sm font-medium text-foreground">
          {tR('periode')}
        </p>
        <div className="flex flex-wrap gap-2">
          {PREREGLAGES.map((p) => (
            <PuceDeFiltre key={p} active={actif === p} onClick={() => setPeriode(bornesDuPrereglage(p))}>
              {tR(`prereglages.${p}`, { annee: bornesDuPrereglage('annee').from.slice(0, 4) })}
            </PuceDeFiltre>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t('from')}</span>
            <DatePicker value={periode.from} onValueChange={(from) => setPeriode((p) => ({ ...p, from }))} />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">{t('to')}</span>
            <DatePicker value={periode.to} onValueChange={(to) => setPeriode((p) => ({ ...p, to }))} />
          </label>
        </div>
      </div>
      {/* TCK-1306 (P112.01) — le plafond de lignes se dit : au-delà, le fichier est coupé. */}
      <p className="rounded-lg bg-muted px-3 py-2 text-ui text-pretty text-foreground" data-testid="exports-row-cap">
        {t('rowCap', { max: f.nombre(PLAFOND_LIGNES_EXPORT), pdf: f.nombre(PLAFOND_LIGNES_EXPORT_PDF) })}
      </p>
      <Button
        type="button"
        className="h-11 w-full"
        disabled={telechargement.enCours !== null}
        onClick={() =>
          void telechargement.telecharger('formulaire', {
            entity,
            format,
            from: periode.from || undefined,
            to: periode.to || undefined,
          })
        }
      >
        {enCours ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
        {enCours ? t('downloading') : tR('telechargerLExport')}
      </Button>
      {telechargement.dernier === 'formulaire' && telechargement.coupe !== null ? (
        <p className="text-sm text-pretty text-foreground" role="status" data-testid="exports-truncated">
          {t('truncated', { plafond: f.nombre(telechargement.coupe) })}
        </p>
      ) : null}
      {telechargement.dernier === 'formulaire' && telechargement.echec ? (
        <p className="text-sm text-pretty text-destructive" role="alert">
          {t('failed')}
        </p>
      ) : null}
    </div>
  );
}
