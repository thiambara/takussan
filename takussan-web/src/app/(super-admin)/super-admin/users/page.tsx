'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/feedback';
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
import { ApiError } from '@/lib/api';
import type { User, UserRole } from '@/types/user';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

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

/**
 * Patron « la donnée porte la clé » (TCK-286) : ces tables sont hors composant, donc
 * hors de portée de `useTranslations`. Elles transportent une clé, le rendu la résout.
 */
const ROLE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: ALL, labelKey: 'roles.all' },
  { value: 'super_admin', labelKey: 'roles.super_admin' },
  { value: 'agency_admin', labelKey: 'roles.agency_admin' },
  { value: 'agent', labelKey: 'roles.agent' },
  { value: 'owner', labelKey: 'roles.owner' },
  { value: 'customer', labelKey: 'roles.customer' },
  { value: 'tenant', labelKey: 'roles.tenant' },
  { value: 'service_provider', labelKey: 'roles.service_provider' },
];

const STATUS_OPTIONS: { value: string; labelKey: string }[] = [
  { value: ALL, labelKey: 'statuses.all' },
  { value: 'active', labelKey: 'statuses.active' },
  { value: 'blocked', labelKey: 'statuses.blocked' },
  { value: 'inactive', labelKey: 'statuses.inactive' },
  { value: 'banned', labelKey: 'statuses.banned' },
];

const EMAIL_OPTIONS: { value: string; labelKey: string }[] = [
  { value: ALL, labelKey: 'emailFilter.all' },
  { value: '1', labelKey: 'emailFilter.verified' },
  { value: '0', labelKey: 'emailFilter.unverified' },
];

const TWOFA_OPTIONS: { value: string; labelKey: string }[] = [
  { value: ALL, labelKey: 'twoFactorFilter.all' },
  { value: '1', labelKey: 'twoFactorFilter.on' },
  { value: '0', labelKey: 'twoFactorFilter.off' },
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
    // TCK-292 (2026-08-22) — un `Error` NU portait ici le libellé anglais « Users fetch failed ».
    // `messageErreurApi` ne le reconnaissait ni comme `ApiError`, ni comme forme technique
    // (`/^API error \d+/`), ni comme sentinelle de framework : il retombait donc dans la branche
    // « un Error nu transporte un message DÉJÀ traduit » et l'affichait TEL QUEL dans
    // `<ErrorState>`, dans les trois langues. Le repli `t('error')` n'était jamais atteint.
    // `ApiError` est la forme que le reste du dépôt lève (`jsonOrThrow` de
    // `src/lib/queries/{admin-users,super-admin,billing,…}.ts`) — et c'est aussi ce que le type
    // `useQuery<UsersResponse, ApiError>` ci-dessous a toujours PRÉTENDU recevoir.
    throw new ApiError(res.status, data);
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
  const t = useTranslations('superAdmin.users');
  const tPage = useTranslations('superAdmin.pages.users');
  const messageErreur = useMessageErreurApi();
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
  const roleOptions = ROLE_OPTIONS.map((opt) => ({ value: opt.value, label: tPage(opt.labelKey) }));
  const statusOptions = STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: tPage(opt.labelKey) }));
  const emailOptions = EMAIL_OPTIONS.map((opt) => ({ value: opt.value, label: tPage(opt.labelKey) }));
  const twoFactorOptions = TWOFA_OPTIONS.map((opt) => ({ value: opt.value, label: tPage(opt.labelKey) }));
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
        <h1 className="font-display text-2xl font-bold text-foreground">{tPage('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tPage('subtitle')}</p>
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
            placeholder={tPage('searchPlaceholder')}
            className="h-10 pl-9"
          />
        </div>
        <Select
          value={role}
          onValueChange={(next) => handleRoleChange((next ?? ALL) as string)}
          items={roleOptions}
        >
          <SelectTrigger aria-label={tPage('roleAria')} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleOptions.map((opt) => (
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
          placeholder={tPage('agencyIdPlaceholder')}
          className="h-10"
        />
        <Select
          value={status}
          onValueChange={(next) => {
            setStatus((next ?? ALL) as string);
            setPage(1);
          }}
          items={statusOptions}
        >
          <SelectTrigger aria-label={tPage('statusAria')} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusOptions.map((opt) => (
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
          items={emailOptions}
        >
          <SelectTrigger aria-label={tPage('emailAria')} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {emailOptions.map((opt) => (
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
          items={twoFactorOptions}
        >
          <SelectTrigger aria-label={tPage('twoFactorAria')} className="h-10 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {twoFactorOptions.map((opt) => (
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
        <ErrorState message={messageErreur(error, t('error'))} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState
          icon={<Users className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
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
                        <span className="font-medium text-foreground">{tPage('rolesLabel')}</span>
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
                        {tPage('agenciesLabel')}{' '}
                        {u.agencies?.length
                          ? u.agencies.map((agency) => agency.name).join(', ')
                          : '—'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tPage('summary', {
                          status: u.status ?? '—',
                          email: u.email_verified_at
                            ? tPage('emailVerified')
                            : tPage('emailUnverified'),
                          twoFactor: u.two_factor_enabled
                            ? tPage('twoFactorOn')
                            : tPage('twoFactorOff'),
                          lastLogin: formatDateTime(u.last_login_at),
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className={buttonVariants({ size: 'sm', variant: 'outline' })}
                      href={`/super-admin/users/${u.id}`}
                    >
                      {tPage('open')}
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTarget(u)}
                      disabled={impersonate.isPending}
                    >
                      {tPage('impersonate')}
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
          title={tPage('impersonateTitle', { name: getUserDisplayName(target) })}
          description={tPage('impersonateDescription')}
          confirmPhrase="IMPERSONIFIER"
          confirmLabel={tPage('impersonateConfirmLabel')}
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
