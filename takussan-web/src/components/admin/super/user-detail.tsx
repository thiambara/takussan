'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Activity, Clock, FileArchive, KeyRound, RotateCcwKey, ShieldCheck, ShieldOff, Unlock, UserRound, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import {
  deleteAdminUserSession,
  fetchAdminUserActivity,
  fetchAdminUserDetail,
  fetchAdminUserSessions,
  postUserSupportAction,
  requestAdminUserDataExport,
  type UserSupportAction,
} from '@/lib/queries/super-admin';

import type { AdminUserDetail, AdminUserSession, AuditLogEntry } from '@/types/super-admin';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { StatusBadge, type StatusTone } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { useFormatteurs } from '@/lib/format/useFormatteurs';

const STATUS_TONES: Record<string, StatusTone> = {
  active: 'success',
  inactive: 'neutral',
  blocked: 'danger',
  banned: 'danger',
};

export function UserDetailPage({ userId }: { userId: number }) {
  const t = useTranslations('superAdmin.userDetail');
  const tCommon = useTranslations('common');
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
      <ErrorState
        message={t('loadError')}
        onRetry={() => void detailQuery.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const user = detailQuery.data.data;

  return (
    <div className="space-y-6">
      <UserDetailHeader user={user} />
      {/* `grid-cols-1` explicite : sans piste sous `xl`, la colonne prenait la largeur de son contenu. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-4">
          <UserProfilesSection user={user} />
          <UserActivityTimeline
            entries={activityQuery.data?.data ?? []}
            loading={activityQuery.isLoading}
            userId={user.id}
          />
        </div>
        <UserSessionsTable
          userId={user.id}
          sessions={sessionsQuery.data?.data ?? []}
          loading={sessionsQuery.isLoading}
        />
      </div>
    </div>
  );
}

export function UserDetailHeader({ user }: { user: AdminUserDetail }) {
  const t = useTranslations('superAdmin.userDetail');
  // Statut et rôle sont des jetons d'API : leurs libellés vivent déjà avec la liste des utilisateurs.
  const tUsers = useTranslations('superAdmin.pages.users');
  return (
    <header className="rounded-xl bg-card p-5 ring-1 ring-border">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserRound className="size-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
              {t('crossTenant')}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-balance break-words text-foreground">
              {user.full_name || user.email}
            </h1>
            <p className="mt-1 truncate text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {user.status ? (
                <StatusBadge
                  tone={STATUS_TONES[user.status] ?? 'neutral'}
                  label={tUsers.has(`statuses.${user.status}`) ? tUsers(`statuses.${user.status}`) : user.status}
                />
              ) : null}
              {user.roles.map((role) => (
                <Badge key={`${role.name}-${role.team_id ?? 'global'}`} variant="outline">
                  {tUsers.has(`roles.${role.name}`) ? tUsers(`roles.${role.name}`) : role.name}{role.team_id ? ` ${t('roleTeam', { id: role.team_id })}` : ''}
                </Badge>
              ))}
              {user.mfa_enabled ? (
                <StatusBadge
                  tone="success"
                  icon={<ShieldCheck className="size-3" aria-hidden="true" />}
                  label={t('mfaActive')}
                />
              ) : null}
            </div>
          </div>
        </div>
        <UserSupportActionsMenu userId={user.id} />
      </div>
    </header>
  );
}

type SupportActionMeta = {
  action: UserSupportAction;
  label: string;
  description: string;
  icon: typeof RotateCcwKey;
  destructive?: boolean;
};

/**
 * TCK-292 — fabrique plutôt que table figée : la donnée porte l'action (jeton d'API) et l'icône,
 * le dictionnaire porte le libellé.
 */
function supportActions(t: (key: string) => string): SupportActionMeta[] {
  return [
    {
      action: 'force-password-reset',
      label: t('support.forcePasswordReset.label'),
      description: t('support.forcePasswordReset.description'),
      icon: RotateCcwKey,
      destructive: true,
    },
    {
      action: 'unlock',
      label: t('support.unlock.label'),
      description: t('support.unlock.description'),
      icon: Unlock,
    },
    {
      action: 'reset-2fa',
      label: t('support.reset2fa.label'),
      description: t('support.reset2fa.description'),
      icon: ShieldOff,
      destructive: true,
    },
    {
      action: 'revoke-sessions',
      label: t('support.revokeSessions.label'),
      description: t('support.revokeSessions.description'),
      icon: XCircle,
      destructive: true,
    },
  ];
}

export function UserSupportActionsMenu({ userId }: { userId: number }) {
  const t = useTranslations('superAdmin.userDetail');
  const [pendingAction, setPendingAction] = useState<UserSupportAction | null>(null);
  const [dataExportOpen, setDataExportOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationFn: ({ action, reason }: { action: UserSupportAction; reason: string }) => (
      postUserSupportAction(userId, action, reason)
    ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'user', userId] }),
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'user', userId, 'sessions'] }),
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'user', userId, 'activity'] }),
      ]);
      toast.add({ title: t('toastActionDone'), type: 'success' });
      setPendingAction(null);
    },
  });
  const dataExportMutation = useMutation({
    mutationFn: (reason: 'support' | 'legal_request' | 'user_inquiry' | 'other') => requestAdminUserDataExport(userId, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'user', userId, 'activity'] });
      toast.add({ title: t('toastExportRequested'), type: 'success' });
      setDataExportOpen(false);
    },
  });
  const actions = supportActions(t);
  const meta = actions.find((item) => item.action === pendingAction) ?? null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.action}
            type="button"
            variant={item.destructive ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setPendingAction(item.action)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Button>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => setDataExportOpen(true)}>
        <FileArchive className="size-4" aria-hidden="true" />
        {t('gdprExport')}
      </Button>
      <DataExportReasonDialog
        open={dataExportOpen}
        pending={dataExportMutation.isPending}
        error={dataExportMutation.error}
        onOpenChange={setDataExportOpen}
        onConfirm={(reason) => dataExportMutation.mutate(reason)}
      />
      {meta ? (
        <SupportReasonDialog
          open={pendingAction !== null}
          onOpenChange={(open) => !open && setPendingAction(null)}
          title={meta.label}
          description={meta.description}
          pending={mutation.isPending}
          error={mutation.error}
          onConfirm={(reason) => mutation.mutate({ action: meta.action, reason })}
        />
      ) : null}
    </div>
  );
}

function DataExportReasonDialog({
  open,
  pending,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  error: Error | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: 'support' | 'legal_request' | 'user_inquiry' | 'other') => void;
}) {
  const t = useTranslations('superAdmin.userDetail.export');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const [reason, setReason] = useState<'support' | 'legal_request' | 'user_inquiry' | 'other'>('support');
  const message = messageErreur(error);
  const reasons: Array<{ value: typeof reason; label: string }> = [
    { value: 'support', label: t('reasons.support') },
    { value: 'legal_request', label: t('reasons.legal_request') },
    { value: 'user_inquiry', label: t('reasons.user_inquiry') },
    { value: 'other', label: t('reasons.other') },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {reasons.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant={reason === item.value ? 'default' : 'outline'}
              onClick={() => setReason(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        {message ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button type="button" onClick={() => onConfirm(reason)} disabled={pending}>
            {pending ? t('pending') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserProfilesSection({ user }: { user: AdminUserDetail }) {
  const t = useTranslations('superAdmin.userDetail.profiles');
  const tUsers = useTranslations('superAdmin.pages.users');
  // Le type porte la CLÉ de rôle (TCK-286) : « Agent » / « Owner » étaient écrits en anglais en dur.
  const profileRows = [
    ...user.profiles.agent.map((profile) => ({ type: 'agent' as const, ...profile })),
    ...user.profiles.owner.map((profile) => ({ type: 'owner' as const, ...profile, license_number: null })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {profileRows.length === 0 ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : null}
        {profileRows.map((profile) => (
          <div key={`${profile.type}-${profile.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{tUsers(`roles.${profile.type}`)}</p>
              <p className="text-sm text-muted-foreground">{profile.agency_name ?? t('agencyFallback', { id: profile.agency_id })}</p>
            </div>
            <div className="flex items-center gap-2">
              {profile.status ? (
                <StatusBadge
                  tone={STATUS_TONES[profile.status] ?? 'neutral'}
                  label={tUsers.has(`statuses.${profile.status}`) ? tUsers(`statuses.${profile.status}`) : profile.status}
                />
              ) : null}
              <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/super-admin/agencies/${profile.agency_id}`}>
                {t('agencyLink')}
              </Link>
            </div>
          </div>
        ))}
        {user.profiles.broker ? <Badge variant="outline">{t('broker')}</Badge> : null}
        {user.profiles.service_provider ? <Badge variant="outline">{t('serviceProvider')}</Badge> : null}
      </CardContent>
    </Card>
  );
}

export function UserSessionsTable({
  userId,
  sessions,
  loading,
}: {
  userId: number;
  sessions: AdminUserSession[];
  loading: boolean;
}) {
  const t = useTranslations('superAdmin.userDetail.sessions');
  const tRoot = useTranslations('superAdmin.userDetail');
  const fmt = useFormatteurs();
  const [sessionToRevoke, setSessionToRevoke] = useState<AdminUserSession | null>(null);
  const queryClient = useQueryClient();
  const toast = useToast();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <Skeleton className="h-24" /> : null}
        {!loading && sessions.length === 0 ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : null}
        {sessions.map((session) => (
          <div key={session.id} className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-foreground">{session.name}</p>
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" aria-hidden="true" />
                <Button type="button" size="sm" variant="outline" onClick={() => setSessionToRevoke(session)}>
                  {t('revoke')}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t('lastActivity', { date: fmt.dateTime(session.last_used_at) })}</p>
            <p className="text-xs text-muted-foreground">{t('expiry', { date: fmt.dateTime(session.expires_at) })}</p>
          </div>
        ))}
      </CardContent>
      {sessionToRevoke ? (
        <SessionRevokeDialog
          session={sessionToRevoke}
          userId={userId}
          onOpenChange={(open) => !open && setSessionToRevoke(null)}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ['super-admin', 'user', userId, 'sessions'] });
            await queryClient.invalidateQueries({ queryKey: ['super-admin', 'user', userId, 'activity'] });
            toast.add({ title: tRoot('toastSessionRevoked'), type: 'success' });
            setSessionToRevoke(null);
          }}
        />
      ) : null}
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
  const t = useTranslations('superAdmin.userDetail.activity');
  const fmt = useFormatteurs();
  return (
    <Card>
      {/* `CardHeader` est une grille : l'action se range à droite par `CardAction`, pas par `flex-row`. */}
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardAction>
          <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href={`/super-admin/audit?filter[causer_id]=${userId}`}>
            {t('viewInAudit')}
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <Skeleton className="h-24" /> : null}
        {!loading && entries.length === 0 ? <p className="text-sm text-muted-foreground">{t('empty')}</p> : null}
        {entries.map((entry) => (
          <div key={entry.id} className="flex gap-3 rounded-lg border border-border p-3">
            <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
              <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium text-foreground">{entry.event ?? entry.description ?? t('fallbackLabel')}</p>
              {/* Le journal répète souvent l'événement dans la description (« created / created ») : une seule fois suffit. */}
              {entry.description && entry.description !== entry.event ? (
                <p className="text-sm text-pretty text-muted-foreground">{entry.description}</p>
              ) : null}
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" aria-hidden="true" />
                {fmt.dateTime(entry.created_at)}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SupportReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  pending: boolean;
  error: Error | null;
  onConfirm: (reason: string) => void;
}) {
  const t = useTranslations('superAdmin.userDetail.supportDialog');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const [reason, setReason] = useState('');
  const message = messageErreur(error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t('reasonLabel')}</Label>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('reasonPlaceholder')}
          />
        </div>
        {message ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={reason.trim().length < 3 || pending}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? t('pending') : tCommon('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionRevokeDialog({
  session,
  userId,
  onOpenChange,
  onSuccess,
}: {
  session: AdminUserSession;
  userId: number;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => Promise<void>;
}) {
  const t = useTranslations('superAdmin.userDetail.sessions');
  const mutation = useMutation({
    mutationFn: (reason: string) => deleteAdminUserSession(userId, session.id, reason),
    onSuccess,
  });

  return (
    <SupportReasonDialog
      open
      onOpenChange={onOpenChange}
      title={t('revokeTitle', { name: session.name })}
      description={t('revokeDescription')}
      pending={mutation.isPending}
      error={mutation.error}
      onConfirm={(reason) => mutation.mutate(reason)}
    />
  );
}
