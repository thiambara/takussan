'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { Activity, Clock, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchAdminUserActivity,
  fetchAdminUserDetail,
  fetchAdminUserSessions,
} from '@/lib/queries/super-admin';
import type { AdminUserDetail, AdminUserSession, AuditLogEntry } from '@/types/super-admin';

export function UserDetailPage({ userId }: { userId: number }) {
  const [detailQuery, sessionsQuery, activityQuery] = useQueries({
    queries: [
      {
        queryKey: ['super-admin', 'user', userId],
        queryFn: () => fetchAdminUserDetail(userId),
      },
      {
        queryKey: ['super-admin', 'user', userId, 'sessions'],
        queryFn: () => fetchAdminUserSessions(userId),
      },
      {
        queryKey: ['super-admin', 'user', userId, 'activity'],
        queryFn: () => fetchAdminUserActivity(userId),
      },
    ],
  });

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Impossible de charger cet utilisateur.
        </CardContent>
      </Card>
    );
  }

  const user = detailQuery.data.data;

  return (
    <div className="space-y-6">
      <UserDetailHeader user={user} />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <UserProfilesSection user={user} />
          <UserActivityTimeline
            entries={activityQuery.data?.data ?? []}
            loading={activityQuery.isLoading}
            userId={user.id}
          />
        </div>
        <UserSessionsTable
          sessions={sessionsQuery.data?.data ?? []}
          loading={sessionsQuery.isLoading}
        />
      </div>
    </div>
  );
}

export function UserDetailHeader({ user }: { user: AdminUserDetail }) {
  return (
    <header className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-stone-100 text-stone-700">
            <UserRound className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">
              Utilisateur cross-tenant
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-stone-950">
              {user.full_name || user.email}
            </h1>
            <p className="mt-1 text-sm text-stone-600">{user.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">{user.status ?? '—'}</Badge>
              {user.roles.map((role) => (
                <Badge key={`${role.name}-${role.team_id ?? 'global'}`} variant="outline">
                  {role.name}{role.team_id ? ` · agence ${role.team_id}` : ''}
                </Badge>
              ))}
              {user.mfa_enabled ? (
                <Badge className="gap-1 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  MFA active
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        <Button variant="outline" disabled>
          Actions support
        </Button>
      </div>
    </header>
  );
}

export function UserProfilesSection({ user }: { user: AdminUserDetail }) {
  const profileRows = [
    ...user.profiles.agent.map((profile) => ({ type: 'Agent', ...profile })),
    ...user.profiles.owner.map((profile) => ({ type: 'Owner', ...profile, license_number: null })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profils & agences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profileRows.length === 0 ? <p className="text-sm text-stone-500">Aucun profil agence.</p> : null}
        {profileRows.map((profile) => (
          <div key={`${profile.type}-${profile.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 p-3">
            <div>
              <p className="font-medium text-stone-950">{profile.type}</p>
              <p className="text-sm text-stone-600">{profile.agency_name ?? `Agence ${profile.agency_id}`}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{profile.status ?? '—'}</Badge>
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/super-admin/agencies/${profile.agency_id}`}>
                Agence
              </Link>
            </div>
          </div>
        ))}
        {user.profiles.broker ? <Badge variant="outline">Broker</Badge> : null}
        {user.profiles.service_provider ? <Badge variant="outline">Service provider</Badge> : null}
      </CardContent>
    </Card>
  );
}

export function UserSessionsTable({ sessions, loading }: { sessions: AdminUserSession[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions actives</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <Skeleton className="h-24" /> : null}
        {!loading && sessions.length === 0 ? <p className="text-sm text-stone-500">Aucune session active.</p> : null}
        {sessions.map((session) => (
          <div key={session.id} className="rounded-lg border border-stone-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-stone-950">{session.name}</p>
              <KeyRound className="size-4 text-amber-700" aria-hidden="true" />
            </div>
            <p className="mt-1 text-sm text-stone-600">Dernière activité : {formatDate(session.last_used_at)}</p>
            <p className="text-xs text-stone-500">Expiration : {formatDate(session.expires_at)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function UserActivityTimeline({
  entries,
  loading,
  userId,
}: {
  entries: AuditLogEntry[];
  loading: boolean;
  userId: number;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Activité</CardTitle>
        <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/super-admin/audit?filter[causer_id]=${userId}`}>
          Voir dans l’audit
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <Skeleton className="h-24" /> : null}
        {!loading && entries.length === 0 ? <p className="text-sm text-stone-500">Aucune activité récente.</p> : null}
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-3 rounded-lg border border-stone-200 p-3">
            <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-stone-100">
              <Activity className="size-4 text-stone-700" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium text-stone-950">{entry.event ?? entry.description ?? 'Activité'}</p>
              <p className="text-sm text-stone-600">{entry.description}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-stone-500">
                <Clock className="size-3" aria-hidden="true" />
                {formatDate(entry.created_at)}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
