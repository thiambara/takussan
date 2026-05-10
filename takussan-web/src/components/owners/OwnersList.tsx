'use client';

/**
 * TCK-256 — owners listing wrapped in react-query so the
 * `<InviteOwnerSheet>` mutation can invalidate it via the shared
 * `['owners', agencyId]` key.
 *
 * The list reads `agency.kind` and the user's `invite_owner` permission
 * (passed in by the server-rendered page) to decide whether to render
 * the "Add owner" CTA. The same checks live server-side
 * ({@see App\Policies\OwnerProfilePolicy}) so an evaded UI gate still
 * yields a 403.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Mail, Ban } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, ApiError, buildQueryString } from '@/lib/api';
import {
  fetchOwners,
  resendInvitation,
  revokeInvitation,
  type OwnerProfileSummary,
  type OwnerProfileStatus,
} from '@/lib/queries/owners';
import type { PaginatedResponse } from '@/types/api';
import { InviteOwnerSheet } from './InviteOwnerSheet';

type Props = {
  readonly agencyId: number;
  readonly canInvite: boolean;
  readonly initialData: PaginatedResponse<OwnerProfileSummary>;
};

const STATUS_VARIANT: Record<OwnerProfileStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  active: 'default',
  inactive: 'outline',
  blocked: 'destructive',
};

export function OwnersList({ agencyId, canInvite, initialData }: Props) {
  const t = useTranslations('owners');
  const tInvite = useTranslations('owners.invite');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  const ownersQuery = useQuery({
    queryKey: ['owners', agencyId],
    queryFn: () => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      return fetchOwners(token, { agencyId });
    },
    initialData,
    enabled: !!token,
  });

  const owners = ownersQuery.data?.data ?? [];

  const resendMutation = useMutation<unknown, ApiError, OwnerProfileSummary>({
    mutationFn: async (owner) => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      const id = await resolveInvitationId(token, owner);
      if (id === null) throw new ApiError(404, { message: 'no pending invitation' });
      return resendInvitation(token, id);
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

  const revokeMutation = useMutation<unknown, ApiError, OwnerProfileSummary>({
    mutationFn: async (owner) => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      const id = await resolveInvitationId(token, owner);
      if (id === null) throw new ApiError(404, { message: 'no pending invitation' });
      return revokeInvitation(token, id);
    },
    onSuccess: async () => {
      toast.add({ title: tInvite('toasts.revoke_success'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['owners', agencyId] });
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
        {canInvite ? (
          <Button onClick={() => setSheetOpen(true)} size="lg">
            <Plus className="size-4" aria-hidden="true" />
            {t('page.add')}
          </Button>
        ) : null}
      </header>

      {owners.length === 0 ? (
        <div className="rounded-xl border border-dashed border-app-surface-2 bg-app-surface-1 p-10 text-center">
          <h2 className="text-base font-semibold text-app-ink">
            {t('page.empty_title')}
          </h2>
          <p className="mt-1 text-sm text-app-ink-muted">
            {t('page.empty_description')}
          </p>
          {canInvite ? (
            <Button onClick={() => setSheetOpen(true)} className="mt-4">
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
                <th className="px-4 py-3 font-semibold">{t('page.columns.status')}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {t('page.columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-surface-2">
              {owners.map((owner) => (
                <OwnerRow
                  key={owner.id}
                  owner={owner}
                  resending={resendMutation.isPending}
                  revoking={revokeMutation.isPending}
                  onResend={() => resendMutation.mutate(owner)}
                  onRevoke={() => revokeMutation.mutate(owner)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canInvite ? (
        <InviteOwnerSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          agencyId={agencyId}
        />
      ) : null}
    </div>
  );
}

type RowProps = {
  readonly owner: OwnerProfileSummary;
  readonly resending: boolean;
  readonly revoking: boolean;
  readonly onResend: () => void;
  readonly onRevoke: () => void;
};

function OwnerRow({ owner, resending, revoking, onResend, onRevoke }: RowProps) {
  const t = useTranslations('owners.page');
  const isDraft = owner.status === 'draft';
  const meta = owner.metadata ?? null;
  const name = owner.user
    ? `${owner.user.first_name ?? ''} ${owner.user.last_name ?? ''}`.trim()
    : `${meta?.first_name ?? ''} ${meta?.last_name ?? ''}`.trim();
  const email = owner.user?.email ?? meta?.email ?? '—';

  return (
    <tr>
      <td className="px-4 py-3 font-semibold text-app-ink">{name || '—'}</td>
      <td className="px-4 py-3 text-app-ink-muted">{email}</td>
      <td className="px-4 py-3">
        <Badge variant={STATUS_VARIANT[owner.status]}>
          {t(`status.${owner.status}`)}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        {isDraft ? (
          <div className="inline-flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={resending}
              onClick={onResend}
            >
              <Mail className="size-3.5" aria-hidden="true" />
              {t('actions.resend')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={revoking}
              onClick={onRevoke}
            >
              <Ban className="size-3.5" aria-hidden="true" />
              {t('actions.revoke')}
            </Button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Resolve the latest pending invitation for this draft profile. The
 * owners listing endpoint doesn't include the invitation id (sparse
 * fieldset), so we look it up via the generic invitation listing scoped
 * to the same email + agency.
 */
async function resolveInvitationId(
  token: string,
  owner: OwnerProfileSummary,
): Promise<number | null> {
  const email = owner.user?.email ?? owner.metadata?.email ?? null;
  if (!email) return null;

  const qs = buildQueryString({
    fields: { invitations: ['id', 'email', 'status', 'agency_id'] },
    filter: { email, status: 'sent', agency_id: owner.agency_id },
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
