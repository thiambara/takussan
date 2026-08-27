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

import { DataTable, PageHeader, type DataTableColumn } from '@/components/console';
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
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

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
  const tErr = useTranslations('errors');
  const t = useTranslations('serviceProviders');
  const tInvite = useTranslations('serviceProviders.invite');
  const tList = useTranslations('serviceProviders.list');
  const tCategories = useTranslations('serviceProviders.invite.trades');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  const providersQuery = useQuery({
    queryKey: ['service-providers', agencyId],
    queryFn: () => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      return fetchServiceProviders(token, { agencyId });
    },
    initialData,
    enabled: !!token,
  });

  const providers = providersQuery.data?.data ?? [];

  const resendMutation = useMutation<unknown, ApiError, ServiceProviderProfileSummary>({
    mutationFn: async (sp) => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      const id = await resolveInvitationId(token, sp, agencyId);
      if (id === null) throw new ApiError(404, { message: tErr('noPendingInvitation') });
      return resendInvitation(token, id);
    },
    onSuccess: () => {
      toast.add({ title: tInvite('toasts.resend_success'), type: 'success' });
    },
    onError: (error) => {
      toast.add({
        title: tInvite('toasts.error_title'),
        description: messageErreur(error),
        type: 'error',
      });
    },
  });

  const revokeMutation = useMutation<unknown, ApiError, ServiceProviderProfileSummary>({
    mutationFn: async (sp) => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      const id = await resolveInvitationId(token, sp, agencyId);
      if (id === null) throw new ApiError(404, { message: tErr('noPendingInvitation') });
      return revokeInvitation(token, id);
    },
    onSuccess: async () => {
      toast.add({ title: tInvite('toasts.revoke_success'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['service-providers', agencyId] });
    },
    onError: (error) => {
      toast.add({
        title: tInvite('toasts.error_title'),
        description: messageErreur(error),
        type: 'error',
      });
    },
  });

  /**
   * Les colonnes, dans l'ORDRE EXACT de la table faite main qu'elles remplacent
   * (nom · métiers · zones · statut · actions), éprouvé par test.
   */
  const colonnes: readonly DataTableColumn<ServiceProviderProfileSummary>[] = [
    {
      id: 'name',
      header: tList('columns.name'),
      className: 'font-semibold text-foreground',
      cell: (sp) => nomDe(sp) || '—',
    },
    {
      id: 'trades',
      header: tList('columns.trades'),
      className: 'text-muted-foreground',
      cell: (sp) => {
        const trades = sp.specialties ?? sp.metadata?.trades ?? [];
        return trades.length === 0 ? (
          '—'
        ) : (
          <div className="flex flex-wrap gap-1">
            {trades.map((trade) => (
              <span key={trade} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {translateTrade(tCategories, trade)}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: 'zones',
      header: tList('columns.zones'),
      className: 'text-muted-foreground',
      cell: (sp) => {
        const zones = sp.service_areas ?? sp.metadata?.intervention_zones ?? [];
        return zones.length === 0 ? '—' : zones.join(', ');
      },
    },
    {
      id: 'status',
      header: tList('columns.status'),
      cell: (sp) => (
        <Badge variant={STATUS_VARIANT[sp.status]}>{tList(`status.${sp.status}`)}</Badge>
      ),
    },
    {
      id: 'actions',
      header: tList('columns.actions'),
      align: 'end',
      cell: (sp) =>
        sp.status === 'draft' ? (
          <div className="inline-flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={resendMutation.isPending}
              onClick={() => resendMutation.mutate(sp)}
            >
              <Mail className="size-3.5" aria-hidden="true" />
              {tList('actions.resend')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={revokeMutation.isPending}
              onClick={() => revokeMutation.mutate(sp)}
            >
              <Ban className="size-3.5" aria-hidden="true" />
              {tList('actions.revoke')}
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('page.title')}
        description={t('page.subtitle')}
        actions={
          canInvite ? (
            <Button onClick={() => setSheetOpen(true)} size="lg">
              <Plus className="size-4" aria-hidden="true" />
              {t('page.add')}
            </Button>
          ) : null
        }
      />

      {providers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted bg-card p-10 text-center">
          <h2 className="text-base font-semibold text-foreground">
            {tList('empty_title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
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
        <DataTable
          caption={t('page.title')}
          columns={colonnes}
          rows={providers}
          rowKey={(sp) => sp.id}
        />
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

/** Le nom composé, seule logique propre à l'ancienne `ProviderRow` qui survivait à la conversion. */
function nomDe(provider: ServiceProviderProfileSummary): string {
  const meta = provider.metadata ?? null;
  return provider.user
    ? `${provider.user.first_name ?? ''} ${provider.user.last_name ?? ''}`.trim()
    : `${meta?.first_name ?? ''} ${meta?.last_name ?? ''}`.trim();
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
