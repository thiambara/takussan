'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DataState,
  DataTable,
  DebouncedSearchInput,
  FilterBar,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type StatusTone,
} from '@/components/console';
import { AgencyCombobox } from '@/components/admin/super/AgencyCombobox';
import { EmptyState } from '@/components/feedback';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmActionDialog } from '@/components/admin/super/ConfirmActionDialog';
import { Pagination } from '@/components/console';
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
 * TCK-363 — les six filtres de l'écran vivent dans l'URL, pas dans six `useState`.
 *
 * Seul `role` y était (TCK-243) ; les cinq autres mouraient à la navigation, et une vue filtrée
 * ne se partageait pas. La table associe le nom du paramètre d'URL — court, lisible, stable —
 * au nom du filtre d'API, qui lui appartient au backend (`filter[email_verified]`, …).
 */
const PARAMS_DE_FILTRE = ['search', 'role', 'agency', 'status', 'email', 'twoFactor'] as const;

/** Le statut du compte → le ton du DS. `banned` et `blocked` disent la même gravité. */
const USER_STATUS_TONES: Record<string, StatusTone> = {
  active: 'success',
  inactive: 'neutral',
  blocked: 'danger',
  banned: 'danger',
};

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
  const tFiltres = useTranslations('console.filterBar');
  const messageErreur = useMessageErreurApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  // TCK-363 — les six filtres sont LUS dans l'URL. Aucun `useState` de filtre ne subsiste :
  // deux sources pour un même filtre, c'est la garantie qu'elles divergeront.
  const search = searchParams?.get('search') ?? '';
  const role = searchParams?.get('role') ?? ALL;
  const agencyId = searchParams?.get('agency') ?? '';
  const status = searchParams?.get('status') ?? ALL;
  const emailVerified = searchParams?.get('email') ?? ALL;
  const twoFactor = searchParams?.get('twoFactor') ?? ALL;
  const page = Number.parseInt(searchParams?.get('page') ?? '1', 10) || 1;
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

  const { data, isLoading, isFetching, isError, error } = useQuery<UsersResponse, ApiError>({
    queryKey: ['super-admin', 'users', params],
    queryFn: () => fetchUsers(params),
    staleTime: 15_000,
  });

  const updateParam = useCallback(
    (key: string, next: string) => {
      const next_params = new URLSearchParams(searchParams?.toString() ?? '');
      if (next && next !== ALL) {
        next_params.set(key, next);
      } else {
        next_params.delete(key);
      }
      // Changer un filtre remet la pagination à sa première page — sinon on atterrit page 4
      // d'un jeu de résultats qui n'en a plus qu'une.
      if (key !== 'page') next_params.delete('page');
      const qs = next_params.toString();
      router.replace(qs ? `?${qs}` : '?');
    },
    [router, searchParams],
  );

  const filtresPoses = PARAMS_DE_FILTRE.some((cle) => (searchParams?.get(cle) ?? '') !== '');

  // « Réinitialiser » vide l'URL — pas seulement les filtres qu'on connaît : la page, le tri et
  // tout ce qu'un ticket futur y déposera repartent aussi de leur valeur par défaut.
  const reinitialiser = useCallback(() => router.replace('?'), [router]);

  const columns: DataTableColumn<SuperAdminUser>[] = [
    {
      id: 'user',
      header: tPage('columns.user'),
      cell: (u) => {
        const label = getUserDisplayName(u);
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size="sm" className="shrink-0">
              <AvatarFallback>{getInitials(label)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground">{label}</p>
              <p className="truncate text-xs text-muted-foreground">
                {u.email}
                {u.phone ? ` · ${u.phone}` : ''}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      id: 'roles',
      header: tPage('columns.roles'),
      cell: (u) => {
        const roles = getUserRoleLabels(u);
        return roles.length ? (
          <div className="flex flex-wrap gap-1">
            {roles.map((roleName) => (
              <Badge key={roleName} variant="outline">{roleName}</Badge>
            ))}
          </div>
        ) : (
          '—'
        );
      },
    },
    {
      id: 'agencies',
      header: tPage('columns.agencies'),
      className: 'max-w-48 text-muted-foreground',
      cell: (u) =>
        u.agencies?.length ? u.agencies.map((agency) => agency.name).join(', ') : '—',
    },
    {
      id: 'status',
      header: tPage('columns.status'),
      cell: (u) =>
        u.status ? (
          <StatusBadge tone={USER_STATUS_TONES[u.status] ?? 'neutral'} label={u.status} />
        ) : (
          '—'
        ),
    },
    {
      id: 'security',
      header: tPage('columns.security'),
      className: 'text-xs text-muted-foreground',
      // Les deux valeurs sont PRÉFIXÉES de ce qu'elles qualifient : seules, « vérifié » et
      // « activée » (en anglais « verified » et « on ») ne disent pas laquelle porte l'email et
      // laquelle le 2FA. C'est ce que la phrase `summary` — supprimée avec les cartes — portait.
      cell: (u) => (
        <>
          <span className="block">
            {tPage('securityEmail', {
              value: u.email_verified_at ? tPage('emailVerified') : tPage('emailUnverified'),
            })}
          </span>
          <span className="block">
            {tPage('securityTwoFactor', {
              value: u.two_factor_enabled ? tPage('twoFactorOn') : tPage('twoFactorOff'),
            })}
          </span>
        </>
      ),
    },
    {
      id: 'lastLogin',
      header: tPage('columns.lastLogin'),
      className: 'text-muted-foreground',
      cell: (u) => formatDateTime(u.last_login_at),
    },
    {
      id: 'actions',
      header: tPage('columns.actions'),
      headerSrOnly: true,
      align: 'end',
      cell: (u) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Link
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
            href={`/super-admin/users/${u.id}`}
          >
            {tPage('open')}
          </Link>
          <Button size="sm" variant="outline" onClick={() => setTarget(u)} disabled={impersonate.isPending}>
            {tPage('impersonate')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={tPage('title')} description={tPage('subtitle')} />

      {/*
        `data ? … : undefined` et non `?? 0` : annoncer « aucun résultat » pendant le chargement,
        c'est répondre avant d'avoir demandé.
      */}
      <FilterBar
        controlsClassName="md:grid-cols-3 xl:grid-cols-6"
        resultCount={data ? tFiltres('results', { count: data.meta?.total ?? 0 }) : undefined}
        onReset={reinitialiser}
        resetLabel={tFiltres('reset')}
        resetDisabled={!filtresPoses}
      >
        <DebouncedSearchInput
          className="md:col-span-2"
          value={search}
          onCommit={(next) => updateParam('search', next)}
          placeholder={tPage('searchPlaceholder')}
          aria-label={tPage('searchAria')}
          busy={isFetching}
        />
        <Select
          value={role}
          onValueChange={(next) => updateParam('role', (next ?? ALL) as string)}
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
        <AgencyCombobox
          value={agencyId}
          onChange={(next) => updateParam('agency', next)}
          label={tPage('agencyAria')}
        />
        <Select
          value={status}
          onValueChange={(next) => updateParam('status', (next ?? ALL) as string)}
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
          onValueChange={(next) => updateParam('email', (next ?? ALL) as string)}
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
          onValueChange={(next) => updateParam('twoFactor', (next ?? ALL) as string)}
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
      </FilterBar>

      <DataState
        data-testid="users-loading"
        loading={isLoading}
        error={isError ? messageErreur(error, t('error')) : null}
        isEmpty={!data || data.data.length === 0}
        skeletonRowClassName="h-16"
        emptyState={
          <EmptyState
            icon={<Users className="size-8" aria-hidden="true" />}
            title={t('empty_title')}
            description={t('empty_description')}
          />
        }
      >
        <DataTable
          caption={tPage('tableCaption')}
          columns={columns}
          rows={data?.data ?? []}
          rowKey={(u) => u.id}
          rowProps={(u) => ({ 'data-testid': `super-admin-user-${u.id}` })}
        />
      </DataState>

      {data?.meta?.last_page ? (
        <Pagination
          page={data.meta.current_page ?? page}
          lastPage={data.meta.last_page}
          onChange={(next) => updateParam('page', String(next))}
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
