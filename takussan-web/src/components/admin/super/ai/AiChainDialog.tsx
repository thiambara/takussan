'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { fetchAdminAiEvaluation, postAdminAiEvaluation, putAdminAiRole } from '@/lib/queries/super-admin';
import type { AiEvaluationStatus, AiModelLink, AiProvider, AiRoleRow } from '@/types/super-admin';
import { ERREURS_APPEL_IA } from './codes-erreur-appel';
import { useMontantIa } from './useMontantIa';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: AiRoleRow;
  providers: AiProvider[];
};

const TON_PAR_STATUT: Record<AiEvaluationStatus, StatusTone> = {
  queued: 'neutral',
  running: 'info',
  done: 'success',
  failed: 'danger',
};

/** Les codes pointés qu'écrit l'API dans `error_code` (`AiEvaluationRun`, `RunAiEvaluation::failed`). */
const ERREURS_CONNUES = { 'ai.eval.job_lost': 'jobLost', 'ai.eval.job_failed': 'jobFailed' } as const;

/** Le refus du cliquet : un premier maillon évalué sous la référence ne s'affecte qu'avec un motif. */
function exigeUnMotif(error: unknown): boolean {
  return error instanceof ApiError
    && error.status === 422
    && typeof error.data === 'object'
    && error.data !== null
    && (error.data as { code?: unknown }).code === 'ai.evaluation_below_baseline';
}

/**
 * TCK-2385 — la chaîne d'un rôle se réordonne ici, et changer de modèle n'est jamais un simple menu :
 * le premier maillon s'évalue (« en place / candidat »), et le bouton d'application suit le verdict.
 */
export function AiChainDialog({ open, onOpenChange, row, providers }: Props) {
  const t = useTranslations('superAdmin.pages.ai.chain');
  const tAi = useTranslations('superAdmin.pages.ai');
  const tRoles = useTranslations('superAdmin.pages.ai.roles');
  const format = useFormatter();
  const messageErreur = useMessageErreurApi();
  const montant = useMontantIa();
  const garde = useGardeDoubleFacteur();
  const queryClient = useQueryClient();
  const [chain, setChain] = useState<AiModelLink[]>(row.chain);
  const [runId, setRunId] = useState<number | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  // Posé par un 422 `ai.evaluation_below_baseline` : l'API connaît une évaluation sous la référence
  // que cet écran n'a pas relancée ; le motif devient exigible sans qu'une nouvelle évaluation le dise.
  const [motifExige, setMotifExige] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const premierSelectionnable = providers.find((p) => p.selectable);

  const evaluation = useQuery({
    queryKey: ['super-admin', 'ai', 'evaluation', runId],
    queryFn: () => fetchAdminAiEvaluation(runId!),
    enabled: runId !== null,
    refetchInterval: (q) => (q.state.data && ['queued', 'running'].includes(q.state.data.data.status) ? 2000 : false),
  });
  // Une évaluation qui n'est plus celle du premier maillon (le maillon a changé pendant qu'elle
  // tournait, ou sa réponse est arrivée après coup) ne dit rien du candidat affiché : on l'ignore.
  const brute = evaluation.data?.data;
  const run = brute && brute.candidate?.provider === chain[0]?.provider && brute.candidate?.model === chain[0]?.model ? brute : undefined;
  const enCours = run !== undefined && ['queued', 'running'].includes(run.status);
  const nombre = (valeur: number) => format.number(valeur, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const reports = run?.status === 'done' && run.report ? Object.values(run.report.usages) : [];
  const below = run?.status === 'done' && run.below_baseline === true;
  const motifRequis = below || motifExige;

  const evaluate = useMutation({
    mutationFn: () => avecGardeDoubleFacteur(() => postAdminAiEvaluation({ role: row.role, ...chain[0] }), garde),
    onSuccess: (response) => {
      setError(null);
      setRunId(response.data.id);
    },
    onError: (e) => setError(messageErreur(e)),
  });
  const save = useMutation({
    mutationFn: () => avecGardeDoubleFacteur(
      () => putAdminAiRole(row.role, chain, motifRequis ? overrideReason.trim() || undefined : undefined),
      garde,
    ),
    onSuccess: (data) => {
      queryClient.setQueryData(['super-admin', 'ai', 'roles'], data);
      // La chaîne d'un usage dérive de celle de son rôle : la lecture des usages est périmée.
      void queryClient.invalidateQueries({ queryKey: ['super-admin', 'ai', 'usages'] });
      onOpenChange(false);
    },
    onError: (e) => {
      if (exigeUnMotif(e)) setMotifExige(true);
      setError(messageErreur(e));
    },
  });
  const canSave = chain.length > 0 && !save.isPending && (!motifRequis || overrideReason.trim() !== '');

  // Toute modification du premier maillon rend l'évaluation (et le refus qu'elle a pu valoir) caduque.
  const oublierEvaluation = () => {
    setRunId(null);
    setMotifExige(false);
  };
  const update = (index: number, patch: Partial<AiModelLink>) => {
    setError(null);
    setChain((current) => current.map((link, i) => (i === index ? { ...link, ...patch } : link)));
    if (index === 0) oublierEvaluation();
  };
  const move = (index: number, delta: number) => {
    setError(null);
    setChain((current) => {
      const next = [...current];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
    oublierEvaluation();
  };

  const libelleVerdict = !below
    ? t('verdictOk')
    : reports.some((report) => report.verdict === 'ai.eval.failures')
      ? t('verdictFailures')
      : reports.some((report) => report.verdict === 'ai.eval.baseline_stale')
        ? t('verdictBaselineStale')
        : t('verdictBelow');
  // Aucune référence nulle part : il n'y a rien à tenir, « tient la référence » serait faux.
  const sansReference = !below && reports.length > 0 && reports.every((report) => report.baseline === null);
  const erreurConnue = run?.error_code ? ERREURS_CONNUES[run.error_code as keyof typeof ERREURS_CONNUES] : undefined;
  const erreurAppel = run?.error_code ? ERREURS_APPEL_IA[run.error_code] : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>{t('title', { role: tRoles(`names.${row.role}`) })}</DialogTitle>
        </DialogHeader>

        <ol className="space-y-3">
          {chain.map((link, index) => {
            const models = providers.find((p) => p.key === link.provider)?.models ?? [];
            // TCK-2450 — le fournisseur déjà en chaîne reste lisible, même devenu non sélectionnable : l'API refusera de l'enregistrer.
            const proposes = providers.filter((p) => p.selectable || p.key === link.provider);
            return (
              <li key={index} className="rounded-xl border border-border bg-card p-3">
                <p className="mb-2 text-sm font-medium">{t('link', { position: index + 1 })}</p>
                <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-3">
                  <div className="min-w-0 space-y-1">
                    <Label id={`provider-${index}`}>{t('provider')}</Label>
                    <Select
                      value={link.provider}
                      onValueChange={(v) => v && update(index, { provider: v, model: providers.find((p) => p.key === v)?.models[0] ?? '' })}
                      items={proposes.map((p) => ({ value: p.key, label: p.legal_name }))}
                    >
                      <SelectTrigger className="w-full" aria-labelledby={`provider-${index}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{proposes.map((p) => <SelectItem key={p.key} value={p.key}>{p.legal_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label id={`model-${index}`}>{t('model')}</Label>
                    <Select value={link.model} onValueChange={(v) => v && update(index, { model: v })} items={models.map((m) => ({ value: m, label: m }))}>
                      <SelectTrigger className="w-full min-w-0" aria-labelledby={`model-${index}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`max-${index}`}>{t('maxTokens')}</Label>
                    <Input
                      id={`max-${index}`}
                      type="number"
                      min={1}
                      value={link.max_tokens ?? ''}
                      onChange={(e) => update(index, { max_tokens: e.target.value === '' ? null : Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="mt-2 flex gap-1">
                  <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('up', { position: index + 1 })}><ArrowUp className="size-4" aria-hidden="true" /></Button>
                  <Button size="sm" variant="ghost" disabled={index === chain.length - 1} onClick={() => move(index, 1)} aria-label={t('down', { position: index + 1 })}><ArrowDown className="size-4" aria-hidden="true" /></Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={chain.length === 1}
                    onClick={() => { setError(null); setChain((c) => c.filter((_, i) => i !== index)); oublierEvaluation(); }}
                    aria-label={t('remove')}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
        <Button
          variant="outline"
          size="sm"
          disabled={chain.length >= 5 || premierSelectionnable === undefined}
          onClick={() => {
            if (!premierSelectionnable) return;
            setError(null);
            setChain((c) => [...c, { provider: premierSelectionnable.key, model: premierSelectionnable.models[0] ?? '', max_tokens: null }]);
          }}
        >
          <Plus className="size-4" aria-hidden="true" /> {t('add')}
        </Button>

        <section className="space-y-2 rounded-xl border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t('comparison')}</h3>
            <Button size="sm" variant="outline" disabled={evaluate.isPending || enCours || chain.length === 0} onClick={() => evaluate.mutate()}>{t('evaluate')}</Button>
          </div>
          {run ? <StatusBadge label={tAi(`evaluationStatus.${run.status}`)} tone={TON_PAR_STATUT[run.status]} /> : null}
          {run ? <p className="text-xs text-muted-foreground">{t('evaluatedCandidate', { model: `${run.candidate?.provider} · ${run.candidate?.model}` })}</p> : null}
          {enCours ? <p className="text-sm text-muted-foreground" role="status">{t('evaluating')}</p> : null}
          {evaluation.isError ? <p className="text-sm text-destructive" role="alert">{messageErreur(evaluation.error)}</p> : null}
          {run?.status === 'failed' ? (
            <div className="space-y-0.5 text-sm text-destructive">
              <p>{t('evaluationFailed')}</p>
              {erreurConnue ? <p>{t(`evaluationErrors.${erreurConnue}`)}</p> : null}
              {erreurAppel ? <p>{tAi(`callErrors.${erreurAppel}`)}</p> : null}
              {!erreurConnue && !erreurAppel && run.error_code ? <p className="text-xs text-muted-foreground">{t('evaluationErrorCode', { code: run.error_code })}</p> : null}
            </div>
          ) : null}
          {run?.status === 'done' && run.report ? (
            <>
              {sansReference ? (
                <StatusBadge label={t('noBaseline')} tone="neutral" />
              ) : (
                <StatusBadge label={libelleVerdict} tone={below ? 'danger' : 'success'} />
              )}
              {reports.map((report) => (
                <table key={report.usage} className="w-full text-sm">
                  <caption className="text-left text-muted-foreground">
                    {report.usage}
                    {report.failures > 0 ? ` — ${t('failuresCount', { count: report.failures, cases: report.cases })}` : ''}
                  </caption>
                  <thead><tr><th scope="col" className="text-left">{t('field')}</th><th scope="col" className="text-right">{t('current')}</th><th scope="col" className="text-right">{t('candidate')}</th></tr></thead>
                  <tbody>
                    <tr className="font-medium">
                      <th scope="row" className="text-left font-medium">{t('global')}</th>
                      <td className="text-right tabular-nums">{report.baseline ? nombre(report.baseline.global) : '—'}</td>
                      <td className="text-right tabular-nums">{nombre(report.global)}</td>
                    </tr>
                    {Object.entries(report.fields).map(([field, score]) => (
                      <tr key={field}>
                        <td>{field}</td>
                        <td className="text-right tabular-nums">{report.baseline?.fields[field] !== undefined ? nombre(report.baseline.fields[field]) : '—'}</td>
                        <td className="text-right tabular-nums">{nombre(score)}</td>
                      </tr>
                    ))}
                    <tr className="text-muted-foreground">
                      <th scope="row" className="text-left font-normal">{t('evaluationCost')}</th>
                      <td className="text-right">—</td>
                      <td className="text-right tabular-nums">{montant(report.cost_usd, run?.usd_to_xof)}</td>
                    </tr>
                  </tbody>
                </table>
              ))}
            </>
          ) : null}
          {motifRequis ? (
            <div className="space-y-1">
              <Label htmlFor="override-reason">{t('overrideReason')}</Label>
              <Textarea id="override-reason" value={overrideReason} maxLength={500} onChange={(e) => setOverrideReason(e.target.value)} />
              <p className="text-xs text-muted-foreground">{t('overrideHint')}</p>
            </div>
          ) : null}
        </section>

        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
          <Button disabled={!canSave} onClick={() => save.mutate()}>{t('save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
