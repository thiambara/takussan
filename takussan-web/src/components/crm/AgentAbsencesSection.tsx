'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import type { Locale } from '@/i18n/config';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import {
  AGENT_CRM_QUERY_KEY,
  declareAbsence,
  fetchAbsences,
  fetchAgencyAgents,
  revokeAbsence,
} from '@/lib/queries/agent-crm';
import type { AgentAbsence } from '@/types/agent-crm';

interface AgentAbsencesSectionProps {
  readonly agencyId: number;
  readonly currentUserId: number;
}

/**
 * TCK-591 §8 — « Déclarer une absence » : un agent absent désigne qui le couvre jusqu'à une date
 * (ADR-0035). Le remplaçant voit alors les tâches, visites et clients de l'absent, et l'absence
 * s'éteint seule à son échéance.
 *
 * Un agent déclare SA propre absence ; déclarer celle d'un autre demande `team.delegate_role` —
 * le select « Qui » n'est proposé qu'à ce titre (la policy reste juge).
 */
export function AgentAbsencesSection({ agencyId, currentUserId }: AgentAbsencesSectionProps) {
  const t = useTranslations('agentCrm.absences');
  const locale = useLocale() as Locale;
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { can: canDeclareForOthers } = useCan('team.delegate_role', agencyId);

  const [open, setOpen] = useState(false);
  const [absentId, setAbsentId] = useState(String(currentUserId));
  const [substituteId, setSubstituteId] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');

  const absences = useQuery<AgentAbsence[], ApiError>({
    queryKey: AGENT_CRM_QUERY_KEY.absences(agencyId),
    queryFn: () => fetchAbsences(token ?? '', agencyId),
    enabled: !!token,
    retry: false,
  });
  const staff = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.staff(agencyId),
    queryFn: () => fetchAgencyAgents(token ?? '', agencyId),
    enabled: !!token && open,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: AGENT_CRM_QUERY_KEY.absences(agencyId) });

  const declare = useMutation<unknown, ApiError, void>({
    mutationFn: () =>
      declareAbsence(token ?? '', agencyId, {
        user_id: Number(absentId),
        substitute_id: Number(substituteId),
        // La fin de la JOURNÉE choisie : une date seule vaudrait minuit, déjà passé pour « aujourd'hui ».
        ends_at: `${endsOn} 23:59:59`,
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      setOpen(false);
      setSubstituteId('');
      setEndsOn('');
      setReason('');
      void refresh();
    },
  });
  const revoke = useMutation<void, ApiError, number>({
    mutationFn: (id) => revokeAbsence(token ?? '', agencyId, id),
    onSuccess: () => void refresh(),
  });

  // L'écran Équipe est aussi ouvert à des profils qui ne sont pas du personnel : un 403 tait la zone.
  if (absences.isError && absences.error.status === 403) return null;

  const people = staff.data ?? [];
  const substitutes = people.filter((p) => String(p.id) !== absentId);
  const rows = absences.data ?? [];

  return (
    <section aria-labelledby="agent-absences-title" className="rounded-lg border border-muted bg-card p-4" data-testid="agent-absences">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="agent-absences-title" className="flex items-center gap-2 text-sm font-semibold">
          <CalendarOff className="size-4" aria-hidden="true" />
          {t('title')}
        </h2>
        {!open ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            {t('declare')}
          </Button>
        ) : null}
      </div>

      {absences.isError ? (
        <p role="alert" className="mt-2 text-sm text-destructive">{t('loadFailed')}</p>
      ) : rows.length === 0 && !absences.isPending ? (
        <p className="mt-2 text-sm text-muted-foreground">{t('none')}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {rows.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {t('row', {
                  absent: a.absent?.name ?? '—',
                  substitute: a.substitute?.name ?? '—',
                  until: formatDate(a.ends_at, locale),
                })}
              </span>
              {a.absent?.id === currentUserId || canDeclareForOthers ? (
                <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(a.id)}>
                  {t('revoke')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            declare.mutate();
          }}
        >
          {canDeclareForOthers ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">{t('absent')}</span>
              <select
                value={absentId}
                onChange={(e) => setAbsentId(e.target.value)}
                className="min-h-11 w-full rounded-md border border-input bg-background px-2"
              >
                {people.some((p) => p.id === currentUserId) ? null : <option value={currentUserId}>{t('me')}</option>}
                {people.map((p) => (
                  <option key={p.id} value={p.id}>{p.id === currentUserId ? t('me') : p.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('substitute')}</span>
            <select
              required
              value={substituteId}
              onChange={(e) => setSubstituteId(e.target.value)}
              className="min-h-11 w-full rounded-md border border-input bg-background px-2"
            >
              <option value="">{t('chooseSubstitute')}</option>
              {substitutes.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('until')}</span>
            <Input type="date" required value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">{t('reason')}</span>
            <Input value={reason} maxLength={255} onChange={(e) => setReason(e.target.value)} />
          </label>
          {declare.error ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {declare.error.proseServeur ?? t('declareFailed')}
            </p>
          ) : null}
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={declare.isPending || substituteId === '' || endsOn === ''}>
              {t('submit')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
