'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileArchive, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { StatusBadge, type StatusTone } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { fetchMyDataExports, requestMyDataExport } from '@/lib/queries/data-exports';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import type { DataExport, DataExportStatus } from '@/types/super-admin';
import { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-567 (M16) — l'API émet un CODE de statut stable (`App\Models\Enums\DataExportStatus`) et
 * le front possède le texte affiché (principe n° 5 de CLAUDE.md). La ligne rendait le code tel
 * quel : `queued`, en anglais, dans une interface en français — relevé par le testeur le
 * 2026-09-23 juste après « Demander mon export ».
 *
 * Le `Record` est exhaustif sur l'union `DataExportStatus` : un sixième cas ajouté au type sans
 * libellé ni ton ici casse `tsc`, au lieu de réapparaître à l'écran sous sa forme brute.
 */
const TON_PAR_STATUT: Record<DataExportStatus, StatusTone> = {
  queued: 'neutral',
  processing: 'info',
  ready: 'success',
  expired: 'neutral',
  failed: 'danger',
};

/** Les statuts où l'archive est encore en fabrication — ceux qui peuvent changer sans l'utilisateur. */
const EN_PREPARATION: ReadonlySet<DataExportStatus> = new Set(['queued', 'processing']);

/**
 * Cadence de rafraîchissement de la liste, pour `refetchInterval`.
 *
 * Sans elle, le statut restait figé sur « en attente » jusqu'au rechargement de la page, alors que
 * la fabrication tourne en file (`ProcessDataExport`). On ne suit que ce qui peut encore bouger :
 * dès qu'aucun export n'est en préparation, la requête cesse d'interroger l'API.
 */
export function intervalleDeSuivi(exports: readonly DataExport[] | undefined): number | false {
  return exports?.some((e) => EN_PREPARATION.has(e.status)) ? 10_000 : false;
}

/**
 * TCK-575 — l'instant où une nouvelle demande sera acceptée, quand l'API refuse la demande parce
 * qu'une autre date de moins de 24 h (`Me\DataExportController::store`).
 *
 * Sans lui, le 429 tombait dans le libellé générique du limiteur de débit — « Trop de tentatives.
 * Réessayez dans quelques minutes. » —, une promesse fausse : l'attente va jusqu'à 24 h, et
 * l'utilisateur qui réessayait « dans quelques minutes » était refusé encore. `null` pour tout
 * autre refus, qui garde le chemin commun.
 */
export function prochaineDemandePossible(erreur: unknown): string | null {
  if (!(erreur instanceof ApiError) || erreur.status !== 429) return null;
  const corps = erreur.data as { code?: unknown; available_at?: unknown } | null;
  if (!corps || corps.code !== 'data_export_throttled' || typeof corps.available_at !== 'string') return null;
  return corps.available_at;
}

export function DataExportsPanel() {
  const t = useTranslations('privacy.dataExports');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['me', 'data-exports'],
    queryFn: fetchMyDataExports,
    staleTime: 30_000,
    refetchInterval: (q) => intervalleDeSuivi(q.state.data?.data),
  });
  const mutation = useMutation({
    mutationFn: requestMyDataExport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me', 'data-exports'] }),
  });
  const error = mutation.error;
  const fmt = useFormatteurs();
  const disponibleLe = prochaineDemandePossible(error);
  const exports = query.data?.data ?? [];

  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">{t('title')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
        {/* Cibles d'au moins 44 px au doigt (le plancher des primitives est de 40 et 36 px) : mesuré
            36 px sur ce panneau à 320, 360 et 390 (TCK-575). */}
        <Button
          type="button"
          data-testid="data-export-request"
          className="max-sm:min-h-11"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          <FileArchive className="size-4" aria-hidden="true" />
          {t('request')}
        </Button>
      </div>

      {error ? (
        <p role="alert" data-testid="data-export-error" className="mt-3 text-sm text-destructive">
          {disponibleLe ? t('throttled', { date: fmt.dateTime(disponibleLe) }) : messageErreur(error)}
        </p>
      ) : null}

      {/* L'état vide passe par l'unique `<EmptyState>` du produit (charte : une seule façon
          d'afficher un état vide) — il était un paragraphe maison dans la liste bordée. */}
      {!query.isLoading && exports.length === 0 ? (
        <EmptyState
          data-testid="data-exports-empty"
          className="mt-5 p-6"
          icon={<FileArchive className="size-8" aria-hidden="true" />}
          title={t('empty')}
          description={t('emptyHint')}
        />
      ) : null}
      {exports.length > 0 ? (
        <div className="mt-5 divide-y divide-border rounded-lg border border-border">
          {exports.map((dataExport) => (
            <DataExportRow key={dataExport.id} dataExport={dataExport} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DataExportRow({ dataExport }: { dataExport: DataExport }) {
  const t = useTranslations('privacy.dataExports');
  const fmt = useFormatteurs();
  const enPreparation = EN_PREPARATION.has(dataExport.status);

  return (
    <div data-testid="data-export-row" className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-foreground">{t('rowTitle', { id: String(dataExport.id) })}</p>
        <p className="text-muted-foreground">
          {t('requestedAt', { date: fmt.dateTime(dataExport.requested_at) })}
          {dataExport.expires_at ? t('expiresAt', { date: fmt.date(dataExport.expires_at) }) : ''}
        </p>
        {enPreparation ? (
          <p className="mt-1 text-muted-foreground">{t('pendingHint')}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge
          data-testid={`data-export-status-${dataExport.id}`}
          label={t(`status.${dataExport.status}`)}
          tone={TON_PAR_STATUT[dataExport.status]}
        />
        {dataExport.status === 'ready' ? (
          <Link data-testid={`data-export-download-${dataExport.id}`} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'max-sm:min-h-11')} href={`/api/data-exports/${dataExport.id}/download`}>
            <Download className="size-4" aria-hidden="true" />
            {t('download')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
