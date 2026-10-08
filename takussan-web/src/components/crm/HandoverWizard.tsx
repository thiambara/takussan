'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import {
  AGENT_CRM_QUERY_KEY,
  fetchAgencyAgents,
  fetchMemberPortfolio,
  handOverPortfolio,
  removeMember,
} from '@/lib/queries/agent-crm';
import type { MemberPortfolio, PortfolioCategory } from '@/types/agent-crm';

interface Leaver {
  readonly id: number;
  readonly first_name: string;
  readonly last_name: string;
}

interface HandoverWizardProps {
  readonly agencyId: number;
  readonly member: Leaver | null;
  readonly onClose: () => void;
  readonly onDone: () => void;
}

const CATEGORIES: readonly PortfolioCategory[] = [
  'tasks', 'visits', 'maintenance', 'collaborations', 'customers', 'held_properties',
];

/**
 * TCK-591 §8 — « Retirer de l'agence » ouvre la PASSATION, pas une simple confirmation : on voit
 * ce que le partant porte (tâches, visites, interventions, collaborations, clients, biens), on
 * choisit un repreneur, on relit, puis l'API transmet ET retire dans la même transaction.
 *
 * Sans repreneur, le retrait reste possible, mais ASSUMÉ (`leave_unassigned`) : c'est le refus
 * `agency_member.portfolio_not_empty` de l'API rendu en choix explicite. Ce que l'API ne transmet pas encore
 * (les biens détenus, TCK-504) est dit, et exige ce même aveu.
 */
export function HandoverWizard({ agencyId, member, onClose, onDone }: HandoverWizardProps) {
  const t = useTranslations('agentCrm.handover');
  const { token } = useAuth();
  const [successor, setSuccessor] = useState('');
  const [leaveUnassigned, setLeaveUnassigned] = useState(false);
  const [step, setStep] = useState<'choose' | 'review'>('choose');

  const open = member !== null;
  const memberId = member?.id ?? 0;
  const name = member ? `${member.first_name} ${member.last_name}` : '';

  const portfolio = useQuery<MemberPortfolio, ApiError>({
    queryKey: AGENT_CRM_QUERY_KEY.portfolio(agencyId, memberId),
    queryFn: () => fetchMemberPortfolio(token ?? '', agencyId, memberId),
    enabled: open && !!token,
    retry: false,
  });
  const agents = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.staff(agencyId),
    queryFn: () => fetchAgencyAgents(token ?? '', agencyId),
    enabled: open && !!token,
    retry: false,
  });

  const finish = () => {
    setSuccessor('');
    setLeaveUnassigned(false);
    setStep('choose');
    onDone();
  };

  const transfer = useMutation<unknown, ApiError, void>({
    mutationFn: () =>
      handOverPortfolio(token ?? '', agencyId, memberId, {
        successor_id: Number(successor),
        remove_after: true,
        leave_unassigned: leaveUnassigned,
      }),
    onSuccess: finish,
  });
  const removeOnly = useMutation<void, ApiError, void>({
    mutationFn: () => removeMember(token ?? '', agencyId, memberId, leaveUnassigned),
    onSuccess: finish,
  });

  const counts = portfolio.data?.portfolio;
  const pending = new Set(portfolio.data?.pending ?? []);
  const lines = CATEGORIES.filter((c) => (counts?.[c] ?? 0) > 0);
  const empty = counts !== undefined && lines.length === 0;
  const pendingCount = lines.filter((c) => pending.has(c)).reduce((n, c) => n + (counts?.[c] ?? 0), 0);
  const candidates = (agents.data ?? []).filter((a) => a.id !== memberId);
  const successorName = candidates.find((a) => String(a.id) === successor)?.name ?? '';
  const busy = transfer.isPending || removeOnly.isPending;
  const failure = transfer.error ?? removeOnly.error;
  // Un retrait sans repreneur, ou avec des biens que l'API ne transmet pas encore, exige l'aveu.
  const needsLeave = !empty && (successor === '' || pendingCount > 0);

  const close = () => {
    if (busy) return;
    setSuccessor('');
    setLeaveUnassigned(false);
    setStep('choose');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? close() : undefined)}>
      <DialogContent data-testid="handover-wizard">
        <DialogHeader>
          <DialogTitle>{t('title', { name })}</DialogTitle>
          <DialogDescription>{empty ? t('emptyPortfolio') : t('intro', { name })}</DialogDescription>
        </DialogHeader>

        {portfolio.isPending ? (
          <div className="flex justify-center py-6 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          </div>
        ) : portfolio.isError ? (
          <p role="alert" className="text-sm text-destructive">{portfolio.error.proseServeur ?? t('loadFailed')}</p>
        ) : empty ? null : step === 'choose' ? (
          <div className="space-y-4 text-sm">
            <ul className="space-y-1" data-testid="handover-portfolio">
              {lines.map((c) => (
                <li key={c} className="flex justify-between gap-3">
                  <span>{t(`category.${c}`)}</span>
                  <span className="tabular-nums font-medium">
                    {counts?.[c]}
                    {pending.has(c) ? ` · ${t('notTransferable')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div className="space-y-1">
              <label htmlFor="handover-successor" className="font-medium">{t('successor')}</label>
              <select
                id="handover-successor"
                value={successor}
                onChange={(e) => setSuccessor(e.target.value)}
                className="min-h-11 w-full rounded-md border border-input bg-background px-2"
              >
                <option value="">{t('noSuccessor')}</option>
                {candidates.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            {needsLeave ? (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 accent-primary"
                  checked={leaveUnassigned}
                  onChange={(e) => setLeaveUnassigned(e.target.checked)}
                />
                <span>{successor === '' ? t('leaveAll') : t('leavePending', { count: pendingCount })}</span>
              </label>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2 text-sm" data-testid="handover-review">
            <p>{t('reviewIntro', { successor: successorName, name })}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {lines.filter((c) => !pending.has(c)).map((c) => (
                <li key={c}>{t('reviewLine', { count: counts?.[c] ?? 0, category: t(`category.${c}`) })}</li>
              ))}
            </ul>
            {pendingCount > 0 ? <p className="text-muted-foreground">{t('reviewPending', { count: pendingCount })}</p> : null}
          </div>
        )}

        {failure ? <p role="alert" className="text-sm text-destructive">{failure.proseServeur ?? t('failed')}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={step === 'review' ? () => setStep('choose') : close} disabled={busy}>
            {step === 'review' ? t('back') : t('cancel')}
          </Button>
          {empty || (step === 'choose' && successor === '') ? (
            <Button
              variant="destructive"
              disabled={busy || portfolio.isPending || portfolio.isError || (needsLeave && !leaveUnassigned)}
              onClick={() => removeOnly.mutate()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {t('removeOnly')}
            </Button>
          ) : step === 'choose' ? (
            <Button disabled={needsLeave && !leaveUnassigned} onClick={() => setStep('review')}>
              {t('next')}
            </Button>
          ) : (
            <Button variant="destructive" disabled={busy} onClick={() => transfer.mutate()}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {t('confirm')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
