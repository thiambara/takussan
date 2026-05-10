'use client';

/**
 * TCK-260 — carnet prestataires.
 *
 * Listing wrappé dans react-query pour que la mutation
 * {@link InviteServiceProviderSheet} puisse l'invalider via la clé
 * partagée `['service-providers', agencyId]`.
 *
 * Le composant lit `canInvite` (calculé côté serveur dans la page) pour
 * décider d'afficher le CTA "Ajouter un prestataire". Le backend
 * re-vérifie via {@see App\Policies\Profiles\ServiceProviderProfilePolicy}.
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
  fetchServiceProviders,
  resendInvitation,
  revokeInvitation,
  type ServiceProviderProfileSummary,
  type ServiceProviderProfileStatus,
} from '@/lib/queries/service-providers';
import type { PaginatedResponse } from '@/types/api';
import { InviteServiceProviderSheet } from './InviteServiceProviderSheet';

type Props = {
  readonly agencyId: number;
  readonly canInvite: boolean;
  readonly initialData: PaginatedResponse<ServiceProviderProfileSummary>;
};

const STATUS_VARIANT: Record<
  ServiceProviderProfileStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  active: 'default',
  inactive: 'outline',
  suspended: 'destructive',
};

export function ServiceProvidersList({ agencyId, canInvite, initialData }: Props) {
  const t = useTranslations('serviceProviders');
  const tInvite = useTranslations('serviceProviders.invite');
  const tList = useTranslations('serviceProviders.list');
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  const providersQuery = useQuery({
    queryKey: ['service-providers', agencyId],
    queryFn: () => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      return fetchServiceProviders(token, { agencyId });
    },
    initialData,
    enabled: !!token,
  });

  const providers = providersQuery.data?.data ?? [];

  const resendMutation = useMutation<unknown, ApiError, ServiceProviderProfileSummary>({
    mutationFn: async (sp) => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      const id = await resolveInvitationId(token, sp, agencyId);
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

  const revokeMutation = useMutation<unknown, ApiError, ServiceProviderProfileSummary>({
    mutationFn: async (sp) => {
      if (!token) throw new ApiError(401, { message: 'no token' });
      const id = await resolveInvitationId(token, sp, agencyId);
      if (id === null) throw new ApiError(404, { message: 'no pending invitation' });
      return revokeInvitation(token, id);
    },
    onSuccess: async () => {
      toast.add({ title: tInvite('toasts.revoke_success'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['service-providers', agencyId] });
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

      {providers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-app-surface-2 bg-app-surface-1 p-10 text-center">
          <h2 className="text-base font-semibold text-app-ink">
            {tList('empty_title')}
          </h2>
          <p className="mt-1 text-sm text-app-ink-muted">
            {tList('empty_description')}
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
                <th className="px-4 py-3 font-semibold">{tList('columns.name')}</th>
                <th className="px-4 py-3 font-semibold">{tList('columns.trades')}</th>
                <th className="px-4 py-3 font-semibold">{tList('columns.zones')}</th>
                <th className="px-4 py-3 font-semibold">{tList('columns.status')}</th>
                <th className="px-4 py-3 text-right font-semibold">
                  {tList('columns.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-surface-2">
              {providers.map((sp) => (
                <ProviderRow
                  key={sp.id}
                  provider={sp}
                  resending={resendMutation.isPending}
                  revoking={revokeMutation.isPending}
                  onResend={() => resendMutation.mutate(sp)}
                  onRevoke={() => revokeMutation.mutate(sp)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canInvite ? (
        <InviteServiceProviderSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          agencyId={agencyId}
        />
      ) : null}
    </div>
  );
}

type RowProps = {
  readonly provider: ServiceProviderProfileSummary;
  readonly resending: boolean;
  readonly revoking: boolean;
  readonly onResend: () => void;
  readonly onRevoke: () => void;
};

function ProviderRow({ provider, resending, revoking, onResend, onRevoke }: RowProps) {
  const tList = useTranslations('serviceProviders.list');
  const tCategories = useTranslations('serviceProviders.invite.trades');
  const isDraft = provider.status === 'draft';
  const meta = provider.metadata ?? null;
  const name = provider.user
    ? `${provider.user.first_name ?? ''} ${provider.user.last_name ?? ''}`.trim()
    : `${meta?.first_name ?? ''} ${meta?.last_name ?? ''}`.trim();

  const trades = provider.specialties ?? meta?.trades ?? [];
  const zones = provider.service_areas ?? meta?.intervention_zones ?? [];

  return (
    <tr>
      <td className="px-4 py-3 font-semibold text-app-ink">{name || '—'}</td>
      <td className="px-4 py-3 text-app-ink-muted">
        {trades.length === 0 ? (
          '—'
        ) : (
          <div className="flex flex-wrap gap-1">
            {trades.map((trade) => (
              <span
                key={trade}
                className="rounded-full bg-app-surface-2 px-2 py-0.5 text-xs"
              >
                {translateTrade(tCategories, trade)}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-app-ink-muted">
        {zones.length === 0 ? '—' : zones.join(', ')}
      </td>
      <td className="px-4 py-3">
        <Badge variant={STATUS_VARIANT[provider.status]}>
          {tList(`status.${provider.status}`)}
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
              {tList('actions.resend')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={revoking}
              onClick={onRevoke}
            >
              <Ban className="size-3.5" aria-hidden="true" />
              {tList('actions.revoke')}
            </Button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * `useTranslations` raise si la clé n'existe pas — pour les libellés
 * dynamiques (trades sont une enum côté backend) on tente la traduction
 * mais retombe sur la valeur brute si absente, pour rester robuste si
 * la liste s'élargit côté backend avant le front.
 */
function translateTrade(t: (key: string) => string, trade: string): string {
  try {
    return t(trade);
  } catch {
    return trade;
  }
}

/**
 * Resolve la dernière invitation pending pour ce draft. Le listing
 * carnet n'inclut pas l'id d'invitation (sparse fieldset), donc on
 * lookup via le listing générique scoped sur (email, agency).
 */
async function resolveInvitationId(
  token: string,
  provider: ServiceProviderProfileSummary,
  agencyId: number,
): Promise<number | null> {
  const email = provider.user?.email ?? provider.metadata?.email ?? null;
  if (!email) return null;

  const qs = buildQueryString({
    fields: { invitations: ['id', 'email', 'status', 'agency_id'] },
    filter: { email, status: 'sent', agency_id: agencyId },
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
