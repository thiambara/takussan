'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/admin/super/ConfirmActionDialog';
import { useImpersonate } from '@/hooks/useImpersonation';
import type { ApiError } from '@/lib/api';
import type { User, UserRole } from '@/types/user';
import { useRouter } from 'next/navigation';

type SuperAdminUser = Pick<User, 'id' | 'first_name' | 'last_name' | 'email' | 'status'> & {
  full_name?: string | null;
  roles?: Array<UserRole | { name: UserRole | string }>;
};

type UsersResponse = {
  data: SuperAdminUser[];
  meta?: { total?: number; current_page?: number; last_page?: number };
};

async function fetchUsers(search: string, page: number): Promise<UsersResponse> {
  const qs = new URLSearchParams();
  if (search) qs.set('filter[search]', search);
  qs.set('page', String(page));
  qs.set('per_page', '20');
  qs.set('fields[users]', 'id,first_name,last_name,email,status');
  qs.set('include', 'roles');
  const res = await fetch(`/api/super-admin-users?${qs.toString()}`, { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw Object.assign(new Error('Users fetch failed'), { status: res.status, data });
  }
  return res.json();
}

function getUserDisplayName(user: SuperAdminUser): string {
  return user.full_name || [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email;
}

function getUserRoleLabels(user: SuperAdminUser): string[] {
  return (user.roles ?? []).map((role) => (typeof role === 'string' ? role : role.name));
}

export default function SuperAdminUsersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<SuperAdminUser | null>(null);
  const impersonate = useImpersonate();

  const { data, isLoading, isError, error } = useQuery<UsersResponse, ApiError>({
    queryKey: ['super-admin', 'users', search, page],
    queryFn: () => fetchUsers(search, page),
    staleTime: 15_000,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Utilisateurs</h1>
        <p className="mt-1 text-sm text-stone-600">
          Recherche cross-tenant et impersonation pour le support.
        </p>
      </header>

      <input
        type="search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Rechercher (nom, email)"
        className="w-full max-w-md rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
      />

      {isLoading ? (
        <div className="space-y-2" data-testid="users-loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-stone-200" aria-hidden="true" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900" role="alert">
          Erreur de chargement. {error?.displayMessage}
        </div>
      ) : !data || data.data.length === 0 ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-stone-500 ring-1 ring-stone-200">
          Aucun utilisateur trouvé.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl bg-white ring-1 ring-stone-200">
          {data.data.map((u) => {
            const label = getUserDisplayName(u);
            const roles = getUserRoleLabels(u);

            return (
              <li
                key={u.id}
                data-testid={`super-admin-user-${u.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-stone-900">{label}</p>
                  <p className="text-xs text-stone-500">{u.email}</p>
                  <p className="text-xs text-stone-500">
                    Rôles : {roles.length ? roles.join(', ') : '—'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className={buttonVariants({ size: 'sm', variant: 'outline' })} href={`/super-admin/users/${u.id}`}>
                    Ouvrir
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => setTarget(u)} disabled={impersonate.isPending}>
                    Impersonifier
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {target ? (
        <ConfirmActionDialog
          open={target !== null}
          onOpenChange={(open) => !open && setTarget(null)}
          title={`Impersonifier ${getUserDisplayName(target)}`}
          description="Vous obtiendrez un token éphémère (≤ 1h) pour agir en tant que cet utilisateur. Toutes les actions sont auditées."
          confirmPhrase="IMPERSONIFIER"
          confirmLabel="Lancer l’impersonation"
          destructive
          pending={impersonate.isPending}
          onConfirm={() => {
            impersonate.mutate(
              { targetUserId: target.id, targetLabel: getUserDisplayName(target) },
              {
                onSuccess: () => {
                  setTarget(null);
                  router.push('/app');
                },
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}
