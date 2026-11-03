'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { FlaskConical } from 'lucide-react';
import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { fetchAdminAiEvaluationSuite, postAdminAiEvaluationSuite } from '@/lib/queries/super-admin';
import type { AiEvalReport, AiEvaluationStatus } from '@/types/super-admin';
import { useMontantIa } from './useMontantIa';

const CLE = ['super-admin', 'ai', 'evaluation-suite'] as const;

const TON_PAR_STATUT: Record<AiEvaluationStatus, StatusTone> = {
  queued: 'neutral',
  running: 'info',
  done: 'success',
  failed: 'danger',
};

const TON_DU_VERDICT: Record<'tenue' | 'sous', StatusTone> = { tenue: 'success', sous: 'danger' };

/**
 * TCK-2459 — l'évaluation complète ne tourne plus la nuit : elle se lance ici, à la main, parce qu'elle
 * appelle de vrais modèles. Le coût du dernier passage s'affiche AVANT de confirmer, pas après.
 */
export function AiEvaluationSuitePanel() {
  const t = useTranslations('superAdmin.pages.ai.suite');
  const tCommon = useTranslations('common');
  const format = useFormatter();
  const messageErreur = useMessageErreurApi();
  const montant = useMontantIa();
  const garde = useGardeDoubleFacteur();
  const queryClient = useQueryClient();
  const { can } = usePlatformAbilities();
  const [confirmer, setConfirmer] = useState(false);

  const query = useQuery({
    queryKey: CLE,
    queryFn: fetchAdminAiEvaluationSuite,
    refetchInterval: (q) => (q.state.data?.data && ['queued', 'running'].includes(q.state.data.data.status) ? 3000 : false),
  });
  const run = query.data?.data ?? null;
  const enCours = run !== null && ['queued', 'running'].includes(run.status);
  const rapports = run?.status === 'done' && run.report ? Object.entries(run.report.usages) : [];
  const coutTotal = run?.total_cost_usd ?? '0';
  const enEchec = run?.status === 'failed';

  const lancer = useMutation({
    mutationFn: () => avecGardeDoubleFacteur(() => postAdminAiEvaluationSuite(), garde),
    onSuccess: (reponse) => {
      queryClient.setQueryData(CLE, reponse);
      setConfirmer(false);
    },
  });

  const nombre = (valeur: number) => format.number(valeur, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const colonnes: DataTableColumn<[string, AiEvalReport]>[] = [
    { id: 'usage', header: t('columns.usage'), cell: ([key]) => <code className="text-sm">{key}</code> },
    { id: 'score', header: t('columns.score'), align: 'end', cell: ([, r]) => <span className="tabular-nums">{nombre(r.global)}</span> },
    { id: 'baseline', header: t('columns.baseline'), align: 'end', cell: ([, r]) => <span className="tabular-nums">{r.baseline ? nombre(r.baseline.global) : '—'}</span> },
    { id: 'cases', header: t('columns.cases'), align: 'end', cell: ([, r]) => <span className="tabular-nums">{r.cases}</span> },
    { id: 'failures', header: t('columns.failures'), align: 'end', cell: ([, r]) => <span className="tabular-nums">{r.failures}</span> },
    { id: 'cost', header: t('columns.cost'), align: 'end', cell: ([, r]) => <span className="tabular-nums">{montant(r.cost_usd, run?.usd_to_xof)}</span> },
    {
      id: 'verdict',
      header: t('columns.verdict'),
      cell: ([, r]) => <StatusBadge tone={TON_DU_VERDICT[r.below_baseline ? 'sous' : 'tenue']} label={r.below_baseline ? t('verdictBelow') : t('verdictOk')} />,
    },
  ];

  return (
    <section aria-labelledby="ai-suite-titre" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 id="ai-suite-titre" className="text-base font-semibold">{t('title')}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">{t('description')}</p>
        </div>
        {can('platform.ai.manage') ? (
          <Button type="button" disabled={enCours || query.isLoading} onClick={() => { lancer.reset(); setConfirmer(true); }} data-testid="ai-suite-lancer">
            <FlaskConical className="size-4" aria-hidden="true" />
            {enCours ? t('running') : t('run')}
          </Button>
        ) : null}
      </div>

      {query.isLoading ? <Skeleton className="h-16 rounded-lg" /> : null}
      {query.isError ? <p role="alert" className="text-sm text-destructive">{messageErreur(query.error)}</p> : null}
      {!query.isLoading && !query.isError && run === null ? <p className="text-sm text-muted-foreground">{t('never')}</p> : null}

      {run !== null ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-live="polite">
          <StatusBadge tone={TON_PAR_STATUT[run.status]} label={t(`status.${run.status}`)} />
          {run.created_at ? <span className="text-muted-foreground">{t('startedAt', { date: format.dateTime(new Date(run.created_at), { dateStyle: 'medium', timeStyle: 'short' }) })}</span> : null}
          {rapports.length > 0 ? <span className="tabular-nums text-muted-foreground">{t('total', { cost: montant(coutTotal, run.usd_to_xof) })}</span> : null}
          {enEchec ? <span role="alert" className="text-destructive">{t('failed')}</span> : null}
        </div>
      ) : null}

      {rapports.length > 0 ? (
        <DataTable caption={t('caption')} columns={colonnes} rows={rapports} rowKey={([key]) => key} density="compact" />
      ) : null}

      <Dialog open={confirmer} onOpenChange={setConfirmer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>
              {rapports.length > 0
                ? t('confirmWithCost', { cost: montant(coutTotal, run?.usd_to_xof) })
                : t('confirmNoCost')}
            </DialogDescription>
          </DialogHeader>
          {lancer.isError ? <p role="alert" className="text-sm text-destructive">{messageErreur(lancer.error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmer(false)}>{tCommon('actions.cancel')}</Button>
            <Button type="button" disabled={lancer.isPending} onClick={() => lancer.mutate()} data-testid="ai-suite-confirmer">{t('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
