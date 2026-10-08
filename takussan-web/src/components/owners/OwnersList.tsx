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
import { Plus, Mail, Ban, UserRound, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DataTable,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type StatusTone,
} from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { apiRequest, ApiError, buildQueryString } from '@/lib/api';
import {
  fetchOwners,
  fetchOwnerSensitive,
  resendInvitation,
  revokeInvitation,
  type OwnerProfileSummary,
  type OwnerProfileStatus,
  type OwnerSensitiveData,
} from '@/lib/queries/owners';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import type { PaginatedResponse } from '@/types/api';
import { InviteOwnerSheet } from './InviteOwnerSheet';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

type Props = {
  readonly agencyId: number;
  readonly canInvite: boolean;
  readonly initialData: PaginatedResponse<OwnerProfileSummary>;
  /**
   * TCK-601 — l'admin de l'agence (ou le super-admin) a le geste « Afficher » ; l'agent ne l'a
   * pas. L'API tranche de toute façon (`OwnerProfilePolicy::viewSensitive`, 403 sinon) : ce
   * drapeau n'évite que de proposer un geste voué au refus.
   */
  readonly canRevealSensitive?: boolean;
};

/**
 * Le SENS de chaque statut, la couleur restant décidée par `StatusBadge`. Les variantes de `Badge`
 * rendaient « Actif » en terracotta primaire — la couleur de l'action, pas celle d'un état sain.
 */
const STATUS_TONE: Record<OwnerProfileStatus, StatusTone> = {
  draft: 'attention',
  active: 'success',
  inactive: 'neutral',
  blocked: 'danger',
};

export function OwnersList({ agencyId, canInvite, initialData, canRevealSensitive = false }: Props) {
  const tErr = useTranslations('errors');
  const t = useTranslations('owners');
  const tInvite = useTranslations('owners.invite');
  const tPage = useTranslations('owners.page');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const garde = useGardeDoubleFacteur();
  /**
   * TCK-601 — les valeurs révélées vivent ICI, dans l'état du composant, et nulle part ailleurs :
   * ni cache React Query (partagé, et persisté par certains écrans), ni `localStorage`. Quitter la
   * page ou « Masquer » les efface.
   */
  const [revealed, setRevealed] = useState<Readonly<Record<number, OwnerSensitiveData>>>({});
  const [revealingId, setRevealingId] = useState<number | null>(null);

  async function reveal(owner: OwnerProfileSummary) {
    if (!token) return;
    setRevealingId(owner.id);
    try {
      const res = await avecGardeDoubleFacteur(() => fetchOwnerSensitive(token, owner.id), garde);
      setRevealed((prev) => ({ ...prev, [owner.id]: res.data }));
    } catch (error) {
      toast.add({
        title: t('sensitive.error_title'),
        description: messageErreur(error),
        type: 'error',
      });
    } finally {
      setRevealingId(null);
    }
  }

  function hide(ownerId: number) {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[ownerId];
      return next;
    });
  }

  const ownersQuery = useQuery({
    queryKey: ['owners', agencyId],
    queryFn: () => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      return fetchOwners(token, { agencyId });
    },
    initialData,
    enabled: !!token,
  });

  const owners = ownersQuery.data?.data ?? [];

  const resendMutation = useMutation<unknown, ApiError, OwnerProfileSummary>({
    mutationFn: async (owner) => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      const id = await resolveInvitationId(token, owner);
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

  const revokeMutation = useMutation<unknown, ApiError, OwnerProfileSummary>({
    mutationFn: async (owner) => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      const id = await resolveInvitationId(token, owner);
      if (id === null) throw new ApiError(404, { message: tErr('noPendingInvitation') });
      return revokeInvitation(token, id);
    },
    onSuccess: async () => {
      toast.add({ title: tInvite('toasts.revoke_success'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['owners', agencyId] });
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
   * (nom · e-mail · statut · actions). L'ordre est éprouvé par test : une colonne perdue
   * à la conversion ne se voit pas dans un diff de quarante lignes.
   */
  const colonnes: readonly DataTableColumn<OwnerProfileSummary>[] = [
    {
      id: 'name',
      header: t('page.columns.name'),
      className: 'font-semibold text-foreground',
      cell: (owner) => nomDe(owner) || '—',
    },
    {
      id: 'email',
      header: t('page.columns.email'),
      className: 'text-muted-foreground',
      cell: (owner) => owner.user?.email ?? owner.metadata?.email ?? '—',
    },
    {
      id: 'identifiers',
      header: t('page.columns.identifiers'),
      cell: (owner) => (
        <OwnerIdentifiersCell
          owner={owner}
          revealed={revealed[owner.id] ?? null}
          canReveal={canRevealSensitive}
          revealing={revealingId === owner.id}
          onReveal={() => reveal(owner)}
          onHide={() => hide(owner.id)}
        />
      ),
    },
    {
      id: 'status',
      header: t('page.columns.status'),
      cell: (owner) => (
        <StatusBadge
          tone={STATUS_TONE[owner.status]}
          label={tPage(`status.${owner.status}`)}
          className="whitespace-nowrap"
        />
      ),
    },
    {
      id: 'actions',
      header: t('page.columns.actions'),
      // Seul un brouillon porte des actions : un en-tête visible coiffait une colonne vide.
      headerSrOnly: true,
      align: 'end',
      cell: (owner) =>
        owner.status === 'draft' ? (
          <div className="inline-flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={resendMutation.isPending}
              onClick={() => resendMutation.mutate(owner)}
            >
              <Mail className="size-3.5" aria-hidden="true" />
              {tPage('actions.resend')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={revokeMutation.isPending}
              onClick={() => revokeMutation.mutate(owner)}
            >
              <Ban className="size-3.5" aria-hidden="true" />
              {tPage('actions.revoke')}
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

      {canRevealSensitive && owners.length > 0 ? (
        <p id="owners-sensitive-notice" className="text-sm text-pretty text-muted-foreground">
          {t('sensitive.notice')}
        </p>
      ) : null}

      {owners.length === 0 ? (
        <EmptyState
          icon={<UserRound className="size-8" aria-hidden="true" />}
          title={t('page.empty_title')}
          description={<span className="text-pretty">{t('page.empty_description')}</span>}
          action={
            canInvite ? (
              <Button onClick={() => setSheetOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                {t('page.add')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          caption={t('page.title')}
          columns={colonnes}
          rows={owners}
          rowKey={(owner) => owner.id}
        />
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

interface OwnerIdentifiersCellProps {
  readonly owner: OwnerProfileSummary;
  readonly revealed: OwnerSensitiveData | null;
  readonly canReveal: boolean;
  readonly revealing: boolean;
  readonly onReveal: () => void;
  readonly onHide: () => void;
}

/**
 * TCK-601 — RIB, NINEA et numéro de pièce : masqués par défaut (la valeur que l'API rend), en
 * clair après le geste « Afficher » de l'admin. Un bailleur sans aucun identifiant rend un tiret
 * et aucun bouton : il n'y a rien à consulter, donc rien à journaliser.
 */
function OwnerIdentifiersCell({
  owner,
  revealed,
  canReveal,
  revealing,
  onReveal,
  onHide,
}: OwnerIdentifiersCellProps) {
  const t = useTranslations('owners.sensitive');
  const lignes = [
    { key: 'rib', label: t('rib'), masked: owner.rib_masked, clear: revealed?.rib },
    { key: 'tax_id', label: t('tax_id'), masked: owner.tax_id_masked, clear: revealed?.tax_id },
    {
      key: 'id_document_number',
      label: t('id_document_number'),
      masked: owner.id_document_number_masked,
      clear: revealed?.id_document_number,
    },
  ].filter((l) => l.masked || l.clear);

  if (lignes.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
        {lignes.map((l) => (
          <div key={l.key} className="contents">
            <dt className="text-muted-foreground">{l.label}</dt>
            <dd className="font-mono tabular-nums text-foreground break-all">
              {revealed ? (l.clear ?? '—') : l.masked}
            </dd>
          </div>
        ))}
      </dl>
      {canReveal ? (
        revealed ? (
          <Button size="sm" variant="ghost" onClick={onHide}>
            <EyeOff className="size-3.5" aria-hidden="true" />
            {t('hide')}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={revealing}
            onClick={onReveal}
            aria-describedby="owners-sensitive-notice"
          >
            {revealing
              ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              : <Eye className="size-3.5" aria-hidden="true" />}
            {t('reveal')}
          </Button>
        )
      ) : null}
    </div>
  );
}

/** Le nom composé, seule logique propre à l'ancienne `OwnerRow` qui survivait à la conversion. */
function nomDe(owner: OwnerProfileSummary): string {
  const meta = owner.metadata ?? null;
  return owner.user
    ? `${owner.user.first_name ?? ''} ${owner.user.last_name ?? ''}`.trim()
    : `${meta?.first_name ?? ''} ${meta?.last_name ?? ''}`.trim();
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
