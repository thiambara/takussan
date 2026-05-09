'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmActionDialog } from '@/components/admin/super/ConfirmActionDialog';
import { Pagination } from '@/components/super-admin/Pagination';
import { useImpersonate } from '@/hooks/useImpersonation';
import type { ApiError } from '@/lib/api';
import type { User, UserRole } from '@/types/user';
import { useRouter, useSearchParams } from 'next/navigation';

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

const ALL = '__all__';

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: 'Tous rôles' },
  { value: 'super_admin', label: 'Super-admin' },
  { value: 'agency_admin', label: 'Admin agence' },
  { value: 'agent', label: 'Agent' },
  { value: 'owner', label: 'Propriétaire' },
  { value: 'customer', label: 'Client' },
  { value: 'tenant', label: 'Locataire' },
  { value: 'service_provider', label: 'Prestataire' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: 'Tous statuts' },
  { value: 'active', label: 'Actif' },
  { value: 'blocked', label: 'Bloqué' },
  { value: 'inactive', label: 'Inactif' },
  { value: 'banned', label: 'Banni' },
];

const EMAIL_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: 'Email : tous' },
  { value: '1', label: 'Email vérifié' },
  { value: '0', label: 'Email non vérifié' },
];

const TWOFA_OPTIONS: { value: string; label: string }[] = [
  { value: ALL, label: '2FA : tous' },
  { value: '1', label: '2FA activée' },
  { value: '0', label: '2FA inactive' },
];

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
  qs.set(
    'fields[users]',
    'id,first_name,last_name,email,phone,status,email_verified_at,two_factor_enabled,last_login_at,created_at',
  );
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
  return (
    user.full_name ||
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
    user.email
  );
}

function getUserRoleLabels(user: SuperAdminUser): string[] {
  return (user.roles ?? []).map((role) => (typeof role === 'string' ? role : role.name));
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function SuperAdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  // Role filter is mirrored to the URL (`?role=…`) so the view is shareable
  // and persists across navigation (AC3, TCK-243).
  const [role, setRole] = useState<string>(() => searchParams?.get('role') ?? ALL);
  const [agencyId, setAgencyId] = useState('');
  const [status, setStatus] = useState(ALL);
  const [emailVerified, setEmailVerified] = useState(ALL);
  const [twoFactor, setTwoFactor] = useState(ALL);
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<SuperAdminUser | null>(null);
  const impersonate = useImpersonate();
  const params = {
    search,
    role: role === ALL ? '' : role,
    agencyId,
    status: status === ALL ? '' : status,
    emailVerified: emailVerified === ALL ? '' : emailVerified,
    twoFactor: twoFactor === ALL ? '' : twoFactor,
    page,
  };

  const { data, isLoading, isError, error } = useQuery<UsersResponse, ApiError>({
    queryKey: ['super-admin', 'users', params],
    queryFn: () => fetchUsers(params),
    staleTime: 15_000,
  });

  const handleRoleChange = useCallback(
    (next: string) => {
      setRole(next);
      setPage(1);
      const next_params = new URLSearchParams(searchParams?.toString() ?? '');
      if (next && next !== ALL) {
        next_params.set('role', next);
      } else {
        next_params.delete('role');
      }
      next_params.delete('page');
      const qs = next_params.toString();
      router.replace(qs ? `?${qs}` : '?');
    },
    [router, searchParams],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Utilisateurs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recherche cross-tenant et impersonation pour le support.
        </p>
      </header>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        <div className="relative md:col-span-2">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Nom, email, ID, téléphone"
            className="h-10 pl-9"
          />
        </div>
        <Select
          value={role}
          onValueChange={(next) => handleRoleChange((next ?? ALL) as string)}
          items={ROLE_OPTIONS}
        >
          <SelectTrigger aria-label="Rôle" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          inputMode="numeric"
          value={agencyId}
          onChange={(e) => {
            setAgencyId(e.target.value);
            setPage(1);
          }}
          placeholder="ID agence"
          className="h-10"
        />
        <Select
          value={status}
          onValueChange={(next) => {
            setStatus((next ?? ALL) as string);
            setPage(1);
          }}
          items={STATUS_OPTIONS}
        >
          <SelectTrigger aria-label="Statut" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={emailVerified}
          onValueChange={(next) => {
            setEmailVerified((next ?? ALL) as string);
            setPage(1);
          }}
          items={EMAIL_OPTIONS}
        >
          <SelectTrigger aria-label="Email vérifié" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EMAIL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={twoFactor}
          onValueChange={(next) => {
            setTwoFactor((next ?? ALL) as string);
            setPage(1);
          }}
          items={TWOFA_OPTIONS}
        >
          <SelectTrigger aria-label="2FA" className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TWOFA_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2" data-testid="users-loading">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-muted"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          Erreur de chargement. {error?.displayMessage}
        </div>
      ) : !data || data.data.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aucun utilisateur trouvé.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data.data.map((u) => {
            const label = getUserDisplayName(u);
            const roles = getUserRoleLabels(u);

            return (
              <Card
                key={u.id}
                data-testid={`super-admin-user-${u.id}`}
                className="transition-colors hover:bg-muted/40"
              >
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar size="lg" className="shrink-0">
                      <AvatarFallback>{getInitials(label)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-foreground">{label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.email}
                        {u.phone ? ` · ${u.phone}` : ''}
                      </p>
                      <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Rôles :</span>
                        {roles.length
                          ? roles.map((roleName) => (
                              <span
                                key={roleName}
                                className="rounded-full bg-muted px-2 py-0.5 text-foreground"
                              >
                                {roleName}
                              </span>
                            ))
                          : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Agences :{' '}
                        {u.agencies?.length
                          ? u.agencies.map((agency) => agency.name).join(', ')
                          : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Statut : {u.status ?? '—'} · Email{' '}
                        {u.email_verified_at ? 'vérifié' : 'non vérifié'} · 2FA{' '}
                        {u.two_factor_enabled ? 'activée' : 'inactive'} · Dernière connexion{' '}
                        {formatDateTime(u.last_login_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className={buttonVariants({ size: 'sm', variant: 'outline' })}
                      href={`/super-admin/users/${u.id}`}
                    >
                      Ouvrir
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTarget(u)}
                      disabled={impersonate.isPending}
                    >
                      Impersonifier
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {data?.meta?.last_page ? (
        <Pagination
          page={data.meta.current_page ?? page}
          lastPage={data.meta.last_page}
          onChange={setPage}
        />
      ) : null}

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
