'use client';

/**
 * TCK-258 — team listing wrapped in react-query so the
 * `<InviteAgentModal>` mutation can invalidate it via the shared
 * `['team', agencyId]` key.
 *
 * The list reads `agency.kind` and the user's `manage_team` permission
 * (passed in by the server-rendered page) to decide whether to render
 * the "Inviter un agent" CTA. The same checks live server-side
 * ({@see App\Policies\AgentProfilePolicy}) so an evaded UI gate still
 * yields a 403.
 *
 * Per-row action menu:
 *  - Renvoyer l'invitation (status=draft)
 *  - Suspendre / Réactiver (status=active|suspended)
 *  - Retirer (DELETE confirm)
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Mail, Ban, RotateCcw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, ApiError, buildQueryString } from '@/lib/api';
import {
  fetchTeam,
  removeAgentProfile,
  suspendAgentProfile,
  type AgentProfileStatus,
  type AgentProfileSummary,
  type InvitedRole,
} from '@/lib/queries/team';
import type { PaginatedResponse } from '@/types/api';
import { InviteAgentModal } from './InviteAgentModal';

type Props = {
  readonly agencyId: number;
  readonly canManage: boolean;
  readonly initialData: PaginatedResponse<AgentProfileSummary>;
};

const STATUS_VARIANT: Record<AgentProfileStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  active: 'default',
  inactive: 'outline',
  suspended: 'destructive',
};

export function TeamMembersList({ agencyId, canManage, initialData }: Props) {
  const t = useTranslations('team');
  const tInvite = useTranslations('team.invite');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  const teamQuery = useQuery({
    queryKey: ['team', agencyId],
    queryFn: () => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      return fetchTeam(token, { agencyId });
    },
    initialData,
    enabled: !!token,
  });

  const members = teamQuery.data?.data ?? [];

  const resendMutation = useMutation<unknown, ApiError, AgentProfileSummary>({
    mutationFn: async (member) => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      const id = await resolveInvitationId(token, member);
      if (id === null) throw new ApiError(404, { message: 'no pending invitation' });
      return apiRequest(`/api/invitations/${id}/resend`, { token, method: 'POST' });
    },
    onSuccess: () => {
      toast.add({ title: tInvite('toasts.resend_success'), type: 'success' });
    },
    onError: (error) => {
      toast.add({
        title: tInvite('toasts.error_title'),
        description: error.displayMessage,
        type: 'error',
      });
    },
  });

  const suspendMutation = useMutation<unknown, ApiError, { member: AgentProfileSummary; active: boolean }>({
    mutationFn: ({ member, active }) => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      return suspendAgentProfile(token, member.id, active);
    },
    onSuccess: async (_, vars) => {
      toast.add({
        title: vars.active
          ? tInvite('toasts.reactivate_success')
          : tInvite('toasts.suspend_success'),
        type: 'success',
      });
      await queryClient.invalidateQueries({ queryKey: ['team', agencyId] });
    },
    onError: (error) => {
      toast.add({
        title: tInvite('toasts.error_title'),
        description: error.displayMessage,
        type: 'error',
      });
    },
  });

  const removeMutation = useMutation<unknown, ApiError, AgentProfileSummary>({
    mutationFn: (member) => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      return removeAgentProfile(token, member.id);
    },
    onSuccess: async () => {
      toast.add({ title: tInvite('toasts.remove_success'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['team', agencyId] });
    },
    onError: (error) => {
      toast.add({
        title: tInvite('toasts.error_title'),
        description: error.displayMessage,
        type: 'error',
      });
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            {t('page.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('page.subtitle')}
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setModalOpen(true)} size="lg">
            <Plus className="size-4" aria-hidden="true" />
            {t('page.add')}
          </Button>
        ) : null}
      </header>

      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-app-surface-2 bg-app-surface-1 p-10 text-center">
          <h2 className="text-base font-semibold text-app-ink">
            {t('page.empty_title')}
          </h2>
          <p className="mt-1 text-sm text-app-ink-muted">
            {t('page.empty_description')}
          </p>
          {canManage ? (
            <Button onClick={() => setModalOpen(true)} className="mt-4">
              <Plus className="size-4" aria-hidden="true" />
              {t('page.add')}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-app-surface-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-app-surface-2/50 text-left text-xs uppercase tracking-wide text-app-ink-muted">
                <th className="px-4 py-3 font-semibold">{t('page.columns.name')}</th>
                <th className="px-4 py-3 font-semibold">{t('page.columns.email')}</th>
                <th className="px-4 py-3 font-semibold">{t('page.columns.role')}</th>
                <th className="px-4 py-3 font-semibold">{t('page.columns.status')}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t('page.columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-surface-2">
              {members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  canManage={canManage}
                  busy={
                    resendMutation.isPending ||
                    suspendMutation.isPending ||
                    removeMutation.isPending
                  }
                  onResend={() => resendMutation.mutate(member)}
                  onSuspend={() =>
                    suspendMutation.mutate({ member, active: false })
                  }
                  onReactivate={() =>
                    suspendMutation.mutate({ member, active: true })
                  }
                  onRemove={() => {
                    if (
                      typeof window === 'undefined' ||
                      window.confirm(tInvite('confirm.remove'))
                    ) {
                      removeMutation.mutate(member);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage ? (
        <InviteAgentModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          agencyId={agencyId}
        />
      ) : null}
    </div>
  );
}

type RowProps = {
  readonly member: AgentProfileSummary;
  readonly canManage: boolean;
  readonly busy: boolean;
  readonly onResend: () => void;
  readonly onSuspend: () => void;
  readonly onReactivate: () => void;
  readonly onRemove: () => void;
};

function MemberRow({
  member,
  canManage,
  busy,
  onResend,
  onSuspend,
  onReactivate,
  onRemove,
}: RowProps) {
  const t = useTranslations('team.page');
  const meta = member.metadata ?? null;
  const name = member.user
    ? `${member.user.first_name ?? ''} ${member.user.last_name ?? ''}`.trim()
    : `${meta?.first_name ?? ''} ${meta?.last_name ?? ''}`.trim();
  const email = member.user?.email ?? meta?.email ?? '—';
  const initials = name
    .split(' ')
    .map((part) => part[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
  const role = (meta?.invited_role ?? 'agent') as InvitedRole;

  return (
    <tr>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            <AvatarFallback className="bg-app-topbar text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-app-ink">{name || '—'}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-app-ink-muted">{email}</td>
      <td className="px-4 py-3">
        <Badge variant="outline">{t(`roles.${role}`)}</Badge>
      </td>
      <td className="px-4 py-3">
        <Badge variant={STATUS_VARIANT[member.status]}>
          {t(`status.${member.status}`)}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        {canManage ? (
          <div className="inline-flex flex-wrap justify-end gap-2">
            {member.status === 'draft' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={onResend}
              >
                <Mail className="size-3.5" aria-hidden="true" />
                {t('actions.resend')}
              </Button>
            ) : null}
            {member.status === 'active' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={onSuspend}
              >
                <Ban className="size-3.5" aria-hidden="true" />
                {t('actions.suspend')}
              </Button>
            ) : null}
            {member.status === 'suspended' ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={onReactivate}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {t('actions.reactivate')}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              {t('actions.remove')}
            </Button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Resolve the latest pending invitation for this draft profile. The
 * team listing endpoint doesn't include the invitation id (sparse
 * fieldset), so we look it up via the generic invitation listing scoped
 * to the same email + agency.
 */
async function resolveInvitationId(
  token: string,
  member: AgentProfileSummary,
): Promise<number | null> {
  const email = member.user?.email ?? member.metadata?.email ?? null;
  if (!email) return null;

  const qs = buildQueryString({
    fields: { invitations: ['id', 'email', 'status', 'agency_id'] },
    filter: { email, status: 'sent', agency_id: member.agency_id },
    sort: '-created_at',
    per_page: 1,
  });

  try {
    const json = await apiRequest<{ data: Array<{ id: number }> }>(
      `/api/invitations${qs ? `?${qs}` : ''}`,
      { token },
    );
    return json.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}
