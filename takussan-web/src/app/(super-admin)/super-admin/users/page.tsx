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
  phone?: string | null;
  email_verified_at?: string | null;
  two_factor_enabled?: boolean;
  last_login_at?: string | null;
  roles?: Array<UserRole | { name: UserRole | string; team_id?: number | null }>;
  agencies?: Array<{ id: number; name: string; slug: string }>;
};

type UsersResponse = {
  data: SuperAdminUser[];
  meta?: { total?: number; current_page?: number; last_page?: number };
};

const ROLE_OPTIONS = ['', 'super_admin', 'agency_admin', 'agent', 'owner', 'customer', 'tenant', 'service_provider'] as const;
const STATUS_OPTIONS = ['', 'active', 'blocked', 'inactive', 'banned'] as const;

type UsersParams = {
  search: string;
  role: string;
  agencyId: string;
  status: string;
  emailVerified: string;
  twoFactor: string;
  page: number;
};

async function fetchUsers(params: UsersParams): Promise<UsersResponse> {
  const qs = new URLSearchParams();
  if (params.search) qs.set('filter[search]', params.search);
  if (params.role) qs.set('filter[role]', params.role);
  if (params.agencyId) qs.set('filter[agency_id]', params.agencyId);
  if (params.status) qs.set('filter[status]', params.status);
  if (params.emailVerified) qs.set('filter[email_verified]', params.emailVerified);
  if (params.twoFactor) qs.set('filter[two_factor_enabled]', params.twoFactor);
  qs.set('page', String(params.page));
  qs.set('per_page', '20');
  qs.set('fields[users]', 'id,first_name,last_name,email,phone,status,email_verified_at,two_factor_enabled,last_login_at,created_at');
  qs.set('include', 'roles,agentProfiles,ownerProfiles');
  qs.set('sort', '-created_at');
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
  const [role, setRole] = useState('');
  const [agencyId, setAgencyId] = useState('');
  const [status, setStatus] = useState('');
  const [emailVerified, setEmailVerified] = useState('');
  const [twoFactor, setTwoFactor] = useState('');
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<SuperAdminUser | null>(null);
  const impersonate = useImpersonate();
  const params = { search, role, agencyId, status, emailVerified, twoFactor, page };

  const { data, isLoading, isError, error } = useQuery<UsersResponse, ApiError>({
    queryKey: ['super-admin', 'users', params],
    queryFn: () => fetchUsers(params),
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

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Nom, email, ID, téléphone"
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm md:col-span-2"
        />
        <select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          aria-label="Rôle"
        >
          {ROLE_OPTIONS.map((value) => (
            <option key={value || 'all'} value={value}>
              {value || 'Tous rôles'}
            </option>
          ))}
        </select>
        <input
          type="number"
          inputMode="numeric"
          value={agencyId}
          onChange={(e) => {
            setAgencyId(e.target.value);
            setPage(1);
          }}
          placeholder="ID agence"
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          aria-label="Statut"
        >
          {STATUS_OPTIONS.map((value) => (
            <option key={value || 'all'} value={value}>
              {value || 'Tous statuts'}
            </option>
          ))}
        </select>
        <select
          value={emailVerified}
          onChange={(e) => {
            setEmailVerified(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          aria-label="Email vérifié"
        >
          <option value="">Email: tous</option>
          <option value="1">Email vérifié</option>
          <option value="0">Email non vérifié</option>
        </select>
        <select
          value={twoFactor}
          onChange={(e) => {
            setTwoFactor(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
          aria-label="2FA"
        >
          <option value="">2FA: tous</option>
          <option value="1">2FA activée</option>
          <option value="0">2FA inactive</option>
        </select>
      </div>

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
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-semibold text-stone-900">{label}</p>
                  <p className="text-xs text-stone-500">{u.email}{u.phone ? ` · ${u.phone}` : ''}</p>
                  <p className="flex flex-wrap gap-1 text-xs text-stone-500">
                    <span className="font-medium text-stone-700">Rôles :</span>
                    {roles.length ? roles.map((roleName) => (
                      <span key={roleName} className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-700">
                        {roleName}
                      </span>
                    )) : '—'}
                  </p>
                  <p className="text-xs text-stone-500">
                    Agences : {u.agencies?.length ? u.agencies.map((agency) => agency.name).join(', ') : '—'}
                  </p>
                  <p className="text-xs text-stone-500">
                    Statut : {u.status ?? '—'} · Email {u.email_verified_at ? 'vérifié' : 'non vérifié'} · 2FA {u.two_factor_enabled ? 'activée' : 'inactive'} · Dernière connexion {formatDateTime(u.last_login_at)}
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

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
