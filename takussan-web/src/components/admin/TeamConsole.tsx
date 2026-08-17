'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { UserPlus, Users } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminUsersFilters } from '@/components/admin/users/AdminUsersFilters';
import { AdminUsersTable } from '@/components/admin/users/AdminUsersTable';
import { UserDetailDrawer } from '@/components/admin/users/UserDetailDrawer';
import { InviteMemberDialog } from '@/components/admin/InviteMemberDialog';
import { ConfirmRemoveDialog } from '@/components/admin/ConfirmRemoveDialog';
import { fetchAdminUsers, postUserAction } from '@/lib/queries/admin-users';
import { removeAgencyMember } from '@/lib/queries/agency-members';
import { useAgencyRoleAssignments } from '@/lib/queries/agency-roles';
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
export function TeamConsole({ agencyId, currentUserId }: TeamConsoleProps) {
  const t = useTranslations('team.page');
  const tCommon = useTranslations('common');
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

  const invalidateList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['admin-users', 'list'] }),
    [queryClient],
  );

  const quickActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'block' | 'activate' }) =>
      postUserAction(id, action),
    onSuccess: () => {
      setActionError(null);
      invalidateList();
    },
    onError: (err: ApiError) => setActionError(err.displayMessage),
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
      setActionError(err instanceof ApiError ? err.displayMessage : 'Une erreur est survenue.'),
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
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="tous">Tous</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="admins">Administrateurs</TabsTrigger>
            <TabsTrigger value="proprietaires">Propriétaires</TabsTrigger>
          </TabsList>
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <UserPlus className="mr-1 size-4" aria-hidden="true" />
            Inviter
          </Button>
        </div>
      </Tabs>

      <AdminUsersFilters hideRoleFilter />

      {actionError ? <ErrorState message={actionError} /> : null}

      {usersQuery.isLoading ? (
        <div className="space-y-2" data-testid="team-console-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-md bg-muted"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : usersQuery.isError ? (
        <ErrorState
          message={usersQuery.error?.displayMessage ?? t('error')}
          onRetry={() => void usersQuery.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : !usersQuery.data || usersQuery.data.data.length === 0 ? (
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
      ) : (
        <>
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
          />
        </>
      )}

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

function Pagination({ page, lastPage }: { page: number; lastPage: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  if (lastPage <= 1) return null;

  const goTo = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(next));
    router.replace(`?${params.toString()}`);
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between text-sm text-muted-foreground"
    >
      <button
        type="button"
        onClick={() => goTo(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-md border border-input bg-background px-3 py-1 disabled:opacity-50"
      >
        Précédent
      </button>
      <span>
        Page {page} sur {lastPage}
      </span>
      <button
        type="button"
        onClick={() => goTo(Math.min(lastPage, page + 1))}
        disabled={page >= lastPage}
        className="rounded-md border border-input bg-background px-3 py-1 disabled:opacity-50"
      >
        Suivant
      </button>
    </nav>
  );
}
