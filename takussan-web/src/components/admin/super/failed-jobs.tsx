'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { CircleCheckBig, FileSearch, Play, RotateCcw, Trash2 } from 'lucide-react';

import { DataState, DataTable, Pagination, StatCard, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  deleteFailedJob,
  fetchFailedJob,
  fetchFailedJobs,
  retryAllFailedJobs,
  retryFailedJob,
} from '@/lib/queries/super-admin';
import type { FailedJob } from '@/types/super-admin';
import { ConfirmActionDialog } from './ConfirmActionDialog';

const PER_PAGE = 20;

/**
 * La cadence de rafraîchissement de la supervision.
 *
 * `system-health` interroge la même liste toutes les 30 s. C'est la cadence d'une page de sondes
 * qu'on garde ouverte pendant un incident ; ce n'en est pas une pour une table paginée dans
 * laquelle on lit un payload — un refetch au milieu d'une lecture réordonne les lignes sous le
 * curseur. TCK-365 demande explicitement « aucune cadence resserrée » : 60 s, et l'invalidation
 * après mutation fait le reste.
 */
const REFETCH_INTERVAL_MS = 60_000;

/** La phrase à retaper pour une purge. Non traduite, comme les phrases de `AgencyModerationCard`. */
const DELETE_PHRASE = 'SUPPRIMER';
/** Idem pour le rejeu en lot. */
const RETRY_ALL_PHRASE = 'REJOUER';

type PendingAction = { kind: 'retry-all' } | { kind: 'delete'; job: FailedJob };

/**
 * La console des jobs échoués (TCK-365).
 *
 * Elle sort de `system-health`, où elle vivait sous les sondes : on n'y arrivait qu'en sachant
 * déjà que la page existait. Elle apporte les trois choses que la version enterrée n'avait pas —
 * la pagination (la table était figée à 20 lignes, les jobs plus anciens étaient hors de
 * portée), le payload ENTIER via l'endpoint de détail, et une confirmation sur les deux actions
 * qui partaient au clic.
 */
export function FailedJobsConsole() {
  const t = useTranslations('superAdmin.failedJobs');
  const tCommon = useTranslations('common');
  // TCK-364 — la locale ACTIVE. Ce fichier est né sur une branche partie AVANT TCK-364 : son
  // `toLocaleString('fr-FR')` n'était pas une négligence, il était invisible des deux côtés.
  // C'est `scripts/check-locale-figee.mjs` qui l'a arrêté à la fusion, pas une relecture.
  const fmt = useFormatteurs();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const jobs = useQuery({
    queryKey: ['super-admin', 'failed-jobs', page],
    queryFn: () => fetchFailedJobs({ page, perPage: PER_PAGE }),
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['super-admin', 'failed-jobs'] });

  const retry = useMutation({ mutationFn: retryFailedJob, onSuccess: invalidate });
  const retryAll = useMutation({
    mutationFn: retryAllFailedJobs,
    onSuccess: () => {
      setPending(null);
      // Une purge de la file entière peut vider la page courante : on revient à la première
      // plutôt que d'afficher un vide qui n'en est pas un.
      setPage(1);
      return invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: deleteFailedJob,
    onSuccess: () => {
      setPending(null);
      return invalidate();
    },
  });

  const rows = jobs.data?.data ?? [];
  const meta = jobs.data?.meta;
  const total = meta?.total ?? 0;
  const lastPage = meta?.last_page ?? 1;

  const columns: DataTableColumn<FailedJob>[] = [
    { id: 'queue', header: t('colQueue'), className: 'font-medium text-foreground', cell: (job) => job.queue },
    {
      id: 'payload',
      // ⚠ `truncate` est ici DÉLIBÉRÉ et ne prive de rien : la liste reçoit déjà un payload coupé
      // à 1024 caractères par l'API. Le texte entier vit derrière le bouton « Détail ».
      header: t('colPayload'),
      className: 'max-w-md truncate text-muted-foreground',
      cell: (job) => job.payload,
    },
    {
      id: 'failedAt',
      header: t('colFailedAt'),
      className: 'text-muted-foreground',
      cell: (job) => fmt.dateTime(job.failed_at),
    },
    {
      id: 'actions',
      header: t('colActions'),
      headerSrOnly: true,
      align: 'end',
      cell: (job) => (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setDetailId(job.id)}>
            <FileSearch className="size-4" aria-hidden="true" />
            {t('detail')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={retry.isPending}
            onClick={() => retry.mutate(job.id)}
          >
            <Play className="size-4" aria-hidden="true" />
            {t('retry')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setPending({ kind: 'delete', job })}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {tCommon('actions.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2">
        <StatCard label={t('statTotal')} value={total} tone={total > 0 ? 'danger' : 'default'} />
        <div className="flex items-end justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={total === 0 || retryAll.isPending}
            onClick={() => setPending({ kind: 'retry-all' })}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('retryAll')}
          </Button>
        </div>
      </section>

      <DataState
        loading={jobs.isLoading}
        error={jobs.isError ? t('loadError') : null}
        onRetry={() => void jobs.refetch()}
        retryLabel={tCommon('actions.retry')}
        skeletonRows={5}
        skeletonRowClassName="h-10"
      >
        <div className="space-y-4">
          <DataTable
            caption={t('tableCaption')}
            columns={columns}
            rows={rows}
            rowKey={(job) => job.id}
            rowProps={(job) => ({ 'data-testid': `failed-job-${job.id}` })}
            emptyState={
              <EmptyState
                className="border-0"
                icon={<CircleCheckBig className="size-8" aria-hidden="true" />}
                title={t('empty_title')}
                description={t('empty_description')}
              />
            }
          />
          <Pagination page={page} lastPage={lastPage} onChange={setPage} />
        </div>
      </DataState>

      <FailedJobDetailDialog id={detailId} onClose={() => setDetailId(null)} />

      {pending ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => !open && setPending(null)}
          title={pending.kind === 'retry-all' ? t('confirmRetryAllTitle') : t('confirmDeleteTitle')}
          description={
            pending.kind === 'retry-all'
              ? t('confirmRetryAllDescription', { count: String(total) })
              : t('confirmDeleteDescription', { count: '1', id: String(pending.job.id) })
          }
          confirmPhrase={pending.kind === 'retry-all' ? RETRY_ALL_PHRASE : DELETE_PHRASE}
          confirmLabel={pending.kind === 'retry-all' ? t('retryAll') : tCommon('actions.delete')}
          destructive={pending.kind === 'delete'}
          pending={retryAll.isPending || remove.isPending}
          onConfirm={() =>
            pending.kind === 'retry-all' ? retryAll.mutate() : remove.mutate(pending.job.id)
          }
        />
      ) : null}
    </div>
  );
}

/**
 * Le détail d'un job, chargé seulement quand `id` est posé (`enabled`).
 *
 * `payload` et `exception` sont rendus dans un `<pre>` qui défile : ce sont des traces de
 * plusieurs milliers de caractères, et une trace repliée sur elle-même n'est pas plus lisible
 * qu'une trace coupée.
 */
function FailedJobDetailDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const t = useTranslations('superAdmin.failedJobs');
  const tCommon = useTranslations('common');
  const fmt = useFormatteurs();
  const detail = useQuery({
    queryKey: ['super-admin', 'failed-job', id],
    queryFn: () => fetchFailedJob(id as number),
    enabled: id !== null,
  });

  const job = detail.data?.data;

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('detailTitle')}</DialogTitle>
          <DialogDescription>{detail.data?.warning ?? t('detailSubtitle')}</DialogDescription>
        </DialogHeader>
        <DataState
          loading={detail.isLoading}
          error={detail.isError ? t('detailError') : null}
          onRetry={() => void detail.refetch()}
          retryLabel={tCommon('actions.retry')}
          skeletonRows={3}
        >
          {job ? (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <DetailField label={t('colQueue')} value={job.queue} />
                <DetailField label={t('detailConnection')} value={job.connection} />
                <DetailField label={t('detailUuid')} value={job.uuid} />
                <DetailField
                  label={t('colFailedAt')}
                  value={fmt.dateTime(job.failed_at)}
                />
              </dl>
              <DetailTrace label={t('colPayload')} testId="failed-job-payload" value={job.payload} />
              <DetailTrace
                label={t('detailException')}
                testId="failed-job-exception"
                value={job.exception}
              />
            </div>
          ) : null}
        </DataState>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tCommon('actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-all text-foreground">{value}</dd>
    </div>
  );
}

function DetailTrace({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
      <pre
        data-testid={testId}
        className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all text-foreground"
      >
        {value}
      </pre>
    </div>
  );
}
