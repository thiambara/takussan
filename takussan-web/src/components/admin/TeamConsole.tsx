'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { UserPlus, Users } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { DataState, Pagination } from '@/components/console';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminUsersFilters } from '@/components/admin/users/AdminUsersFilters';
import { AdminUsersTable } from '@/components/admin/users/AdminUsersTable';
import { UserDetailDrawer } from '@/components/admin/users/UserDetailDrawer';
import { InviteMemberDialog } from '@/components/admin/InviteMemberDialog';
import { ConfirmRemoveDialog } from '@/components/admin/ConfirmRemoveDialog';
import { PendingInvitationsSection } from '@/components/admin/PendingInvitationsSection';
import { fetchAdminUsers, postUserAction } from '@/lib/queries/admin-users';
import { removeAgencyMember } from '@/lib/queries/agency-members';
import { useAgencyRoleAssignments } from '@/lib/queries/agency-roles';
import { agencyInvitationKeys } from '@/lib/queries/agency-invitations';
import { useCan } from '@/hooks/useCan';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import type { AgencyRoleAssignment } from '@/types/agency-role';
import type {
  AdminAgencyUserRow,
  AdminAgencyUsersResponse,
  AdminUserRoleFilter,
  AdminUserStatusFilter,
} from '@/types/admin-users';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

const TAB_VALUES = ['tous', 'agents', 'admins', 'proprietaires'] as const;
type TabValue = (typeof TAB_VALUES)[number];

const TAB_TO_ROLE: Record<TabValue, AdminUserRoleFilter | ''> = {
  tous: '',
  agents: 'agent',
  admins: 'agency_admin',
  proprietaires: 'owner',
};

const ROLE_TO_TAB: Record<string, TabValue> = {
  agent: 'agents',
  agency_admin: 'admins',
  owner: 'proprietaires',
};

interface TeamConsoleProps {
  readonly agencyId: number;
  readonly currentUserId: number;
  /**
   * TCK-368 — `kind` de l'agence active, résolu par la page. Une agence
   * `individual` n'a pas d'équipe : la zone d'invitations ne s'affiche pas.
   * `null` quand l'agence n'a pas pu être lue — la zone se tait alors aussi,
   * plutôt que d'annoncer « aucune invitation » sans avoir su demander.
   */
  readonly agencyKind?: string | null;
}

/**
 * TCK-277 — unified team management console for `/admin/team`. Absorbs
 * the historical `/admin/users` page (cycle-of-life actions, role
 * editor) and the `/admin/team` page (invitation, retrait) into a
 * single screen with segmented tabs per role typology.
 *
 * Tab selection is mirrored as `filter[role]` in the URL so the filter
 * select stays in sync with the segmented control. The role select is
 * intentionally hidden from `AdminUsersFilters` to avoid two controls
 * targeting the same query param.
 */
export function TeamConsole({ agencyId, currentUserId, agencyKind = null }: TeamConsoleProps) {
  const t = useTranslations('team.page');
  const tConsole = useTranslations('admin.team.console');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { token } = useAuth();

  const currentRole = searchParams.get('filter[role]') ?? '';
  const tab: TabValue = ROLE_TO_TAB[currentRole] ?? 'tous';

  const [drawerUser, setDrawerUser] = useState<AdminAgencyUserRow | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<AdminAgencyUserRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      search: searchParams.get('filter[search]') ?? undefined,
      status: (searchParams.get('filter[status]') ?? undefined) as
        | AdminUserStatusFilter
        | undefined,
      role: (searchParams.get('filter[role]') ?? undefined) as
        | AdminUserRoleFilter
        | undefined,
      sort: searchParams.get('sort') ?? '-created_at',
      page: Number.parseInt(searchParams.get('page') ?? '1', 10) || 1,
      perPage: 20,
    }),
    [searchParams],
  );

  // Un état vide qui dit « invitez votre premier agent » alors que l'utilisateur a simplement
  // tapé un nom dans la recherche serait faux. On sépare donc les deux cas.
  const hasActiveFilters = Boolean(params.search || params.status || params.role);

  // La page vit dans l'URL, comme les filtres : c'est ce qui rend une vue partageable. La
  // primitive `Pagination` ne connaît que `page` et `onChange` — le support de l'état lui reste
  // extérieur, et c'est pourquoi elle a pu remplacer trois écritures différentes du même geste.
  const goToPage = useCallback(
    (next: number) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set('page', String(next));
      router.replace(`?${nextParams.toString()}`);
    },
    [router, searchParams],
  );

  const usersQuery = useQuery<AdminAgencyUsersResponse, ApiError>({
    queryKey: ['admin-users', 'list', params],
    queryFn: () => fetchAdminUsers(params),
    staleTime: 15_000,
  });

  // TCK-279 (AC11) — le rôle d'agence de chaque ligne affichée.
  //
  // Une requête SÉPARÉE, et bornée aux ids de la page : `UserResource`
  // n'expose ni l'id du profil ni son rôle, et ne peut pas le faire sans
  // choisir pour tout le produit lequel des N profils d'un utilisateur est
  // « le » profil. La question n'a de réponse que rapportée à une agence.
  const visibleUserIds = useMemo(
    () => (usersQuery.data?.data ?? []).map((u) => u.id),
    [usersQuery.data],
  );
  const assignmentsQuery = useAgencyRoleAssignments(agencyId, visibleUserIds);

  const assignmentsByUser = useMemo(() => {
    const map = new Map<number, AgencyRoleAssignment[]>();
    for (const row of assignmentsQuery.data?.data ?? []) {
      const list = map.get(row.user_id);
      if (list) list.push(row);
      else map.set(row.user_id, [row]);
    }
    return map;
  }, [assignmentsQuery.data]);

  // AC12 — le sélecteur de rôle est gardé par la CAPACITÉ, pas par le type
  // de profil : deux `agency_admin` de la même agence peuvent porter des
  // rôles différents depuis TCK-279, donc « être admin » ne dit plus qu'on
  // peut attribuer un rôle. ⚠️ Cacher le contrôle n'autorise rien : c'est
  // `AgencyRolePolicy::assign` qui décide.
  const { can: canAssignRole } = useCan('team.assign_role', agencyId);

  // TCK-368 — même règle pour la relance et la révocation d'une invitation, et
  // cacher les boutons n'autorise rien : c'est `InvitationPolicy::revoke()` qui
  // décide.
  //
  // ⚠ Ce commentaire affirmait « c'est `team.invite` qui les gouverne côté
  // serveur » alors que la policy ne mentionnait AUCUNE capacité — elle jugeait
  // sur `isAgencyAdminAt()`. Les deux prédicats DIVERGEAIENT : `team.invite`
  // n'étant pas réservée à la plateforme, une agence peut l'attacher à un rôle
  // personnalisé de base `Agent` (TCK-279), et cet agent voyait les deux boutons
  // pour prendre 403 sur les deux. La policy accepte désormais la capacité en
  // plus du profil d'admin, ce qui referme l'écart dans le sens permissif —
  // celui qui n'invente aucune autorisation.
  const { can: canManageInvitations } = useCan('team.invite', agencyId);

  // TCK-368 — l'invalidation porte des DEUX côtés. Une invitation acceptée fait
  // apparaître un membre et disparaître une invitation ; ne rafraîchir qu'une des
  // deux listes laisse l'écran se contredire lui-même jusqu'au prochain
  // rechargement.
  const invalidateList = useCallback(
    () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-users', 'list'] }),
      queryClient.invalidateQueries({ queryKey: agencyInvitationKeys.all }),
    ]),
    [queryClient],
  );

  const quickActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'block' | 'activate' }) =>
      postUserAction(id, action),
    onSuccess: () => {
      setActionError(null);
      invalidateList();
    },
    onError: (err: ApiError) => setActionError(messageErreur(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => removeAgencyMember(agencyId, userId, token ?? ''),
    onSuccess: () => {
      setActionError(null);
      setRemoving(null);
      setDrawerUser(null);
      invalidateList();
    },
    onError: (err) =>
      setActionError(messageErreur(err, tConsole('genericError'))),
  });

  const setTab = useCallback(
    (next: string) => {
      const value = (TAB_VALUES as readonly string[]).includes(next)
        ? (next as TabValue)
        : 'tous';
      const nextRole = TAB_TO_ROLE[value];
      const qs = new URLSearchParams(searchParams.toString());
      if (nextRole) qs.set('filter[role]', nextRole);
      else qs.delete('filter[role]');
      qs.delete('page');
      const str = qs.toString();
      router.replace(str ? `?${str}` : '?');
    },
    [router, searchParams],
  );

  return (
    <div className="space-y-4">
      <PendingInvitationsSection
        agencyId={agencyId}
        agencyKind={agencyKind}
        canManage={canManageInvitations}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="tous">{tConsole('tabs.all')}</TabsTrigger>
            <TabsTrigger value="agents">{tConsole('tabs.agents')}</TabsTrigger>
            <TabsTrigger value="admins">{tConsole('tabs.admins')}</TabsTrigger>
            <TabsTrigger value="proprietaires">{tConsole('tabs.owners')}</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      <AdminUsersFilters hideRoleFilter />

      {actionError ? <ErrorState message={actionError} /> : null}

      <DataState
        data-testid="team-console-loading"
        loading={usersQuery.isLoading}
        error={usersQuery.isError ? messageErreur(usersQuery.error, t('error')) : null}
        onRetry={() => void usersQuery.refetch()}
        retryLabel={tCommon('actions.retry')}
        skeletonRows={6}
        skeletonRowClassName="h-12"
        isEmpty={!usersQuery.data || usersQuery.data.data.length === 0}
        emptyState={(
          // `team.*` était un namespace ORPHELIN : ses clés existaient dans les trois locales et
          // aucun fichier ne les consommait. Elles portent exactement la copie « encouragement +
          // CTA » que `design-guidelines.md:83` exige, là où l'écran affichait en dur « Aucun
          // membre ne correspond aux filtres courants. » — un constat, pas un encouragement.
          <EmptyState
            data-testid="team-console-empty"
            icon={<Users className="size-8" aria-hidden="true" />}
            title={hasActiveFilters ? t('empty_filtered_title') : t('empty_title')}
            description={
              hasActiveFilters ? t('empty_filtered_description') : t('empty_description')
            }
            action={
              hasActiveFilters ? undefined : (
                <Button onClick={() => setInviteOpen(true)}>
                  <UserPlus className="mr-1 size-4" aria-hidden="true" />
                  {t('add')}
                </Button>
              )
            }
          />
        )}
      >
        {usersQuery.data ? (
          <div className="space-y-4">
            <AdminUsersTable
              rows={usersQuery.data.data}
              total={usersQuery.data.meta.total}
              currentUserId={currentUserId}
              assignmentsByUser={assignmentsByUser}
              onSelect={(u) => setDrawerUser(u)}
              onQuickAction={(u, action) => quickActionMutation.mutate({ id: u.id, action })}
              onRemove={(u) => setRemoving(u)}
            />
            <Pagination
              page={usersQuery.data.meta.current_page}
              lastPage={usersQuery.data.meta.last_page ?? usersQuery.data.meta.current_page}
              onChange={goToPage}
            />
          </div>
        ) : null}
      </DataState>

      <UserDetailDrawer
        user={drawerUser}
        currentUserId={currentUserId}
        agencyId={agencyId}
        assignments={drawerUser ? (assignmentsByUser.get(drawerUser.id) ?? []) : []}
        canAssignRole={canAssignRole}
        onOpenChange={(open) => !open && setDrawerUser(null)}
        onRemove={(u) => setRemoving(u)}
        isRemoving={removeMutation.isPending}
      />

      <InviteMemberDialog
        agencyId={agencyId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={invalidateList}
      />

      <ConfirmRemoveDialog
        member={removing}
        onCancel={() => setRemoving(null)}
        onConfirm={(member) => removeMutation.mutate(member.id)}
        isPending={removeMutation.isPending}
      />
    </div>
  );
}
