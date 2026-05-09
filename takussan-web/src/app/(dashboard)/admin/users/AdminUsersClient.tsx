'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminUsersFilters } from '@/components/admin/users/AdminUsersFilters';
import { AdminUsersTable } from '@/components/admin/users/AdminUsersTable';
import { UserDetailDrawer } from '@/components/admin/users/UserDetailDrawer';
import { fetchAdminUsers, postUserAction } from '@/lib/queries/admin-users';
import type {
  AdminAgencyUserRow,
  AdminAgencyUsersResponse,
  AdminUserRoleFilter,
  AdminUserStatusFilter,
} from '@/types/admin-users';
import type { ApiError } from '@/lib/api';

interface AdminUsersClientProps {
  currentUserId: number;
}

export function AdminUsersClient({ currentUserId }: AdminUsersClientProps) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [drawerUser, setDrawerUser] = useState<AdminAgencyUserRow | null>(null);
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

  const usersQuery = useQuery<AdminAgencyUsersResponse, ApiError>({
    queryKey: ['admin-users', 'list', params],
    queryFn: () => fetchAdminUsers(params),
    staleTime: 15_000,
  });

  const quickActionMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'block' | 'activate' }) =>
      postUserAction(id, action),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['admin-users', 'list'] });
    },
    onError: (err: ApiError) => setActionError(err.displayMessage),
  });

  return (
    <div className="space-y-4">
      <AdminUsersFilters />

      {actionError ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </div>
      ) : null}

      {usersQuery.isLoading ? (
        <div className="space-y-2" data-testid="admin-users-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-md bg-muted"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : usersQuery.isError ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900" role="alert">
          Erreur de chargement. {usersQuery.error?.displayMessage}
        </div>
      ) : !usersQuery.data || usersQuery.data.data.length === 0 ? (
        <p
          className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground"
          data-testid="admin-users-empty"
        >
          Aucun utilisateur ne correspond aux filtres courants.
        </p>
      ) : (
        <>
          <AdminUsersTable
            rows={usersQuery.data.data}
            total={usersQuery.data.meta.total}
            currentUserId={currentUserId}
            onSelect={(u) => setDrawerUser(u)}
            onQuickAction={(u, action) => quickActionMutation.mutate({ id: u.id, action })}
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
        onOpenChange={(open) => !open && setDrawerUser(null)}
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
