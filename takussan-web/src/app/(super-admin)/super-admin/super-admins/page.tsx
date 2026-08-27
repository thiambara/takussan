'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Clock,
  Loader2,
  Mail,
  MailWarning,
  RotateCw,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { InviteSuperAdminModal } from '@/components/super-admin/InviteSuperAdminModal';
import {
  fetchSuperAdminListing,
  resendSuperAdminInvitation,
  revokeSuperAdminInvitation,
  type SuperAdminCooptationListing,
  type SuperAdminPendingInvitation,
} from '@/lib/queries/super-admin';
import type { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader, StatusBadge } from '@/components/console';
import { ErrorState } from '@/components/feedback';

/**
 * TCK-264 — Cooptation surface for super-admins.
 *
 * Lists every active super-admin alongside the pending invitations so
 * any peer can see the full pipeline (transparency by default — there
 * is no hidden super-admin in the system).
 *
 * TCK-367 — le cycle de vie de l'invitation devient visible ET actionnable :
 * date d'expiration, état « expirée » distinct de « en attente », relance et
 * annulation à portée de ligne, dernière connexion des actifs. Aucun de ces
 * trois états n'est déduit ici — `is_expired` vient du backend, parce que le
 * cron qui bascule `sent → expired` ne tourne qu'à l'heure et qu'une
 * invitation morte ne doit pas s'afficher « en attente » entre-temps.
 */
export default function SuperAdminsCooptationPage() {
  const t = useTranslations('superAdmin.pages.superAdmins');
  const messageErreur = useMessageErreurApi();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<SuperAdminCooptationListing, ApiError>({
    queryKey: ['super-admins', 'cooptation'],
    queryFn: fetchSuperAdminListing,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['super-admins', 'cooptation'] });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button onClick={() => setOpen(true)}>
            <UserPlus className="size-4" aria-hidden="true" />
            <span>{t('invite')}</span>
          </Button>
        }
      />

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">{t('loading')}</CardContent>
        </Card>
      ) : null}

      {isError ? (
        <ErrorState message={`${t('loadError')} ${messageErreur(error, t('unknownError'))}`} />
      ) : null}

      {data ? (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('activeSection', { count: String(data.super_admins.length) })}
            </h2>
            <div className="space-y-2">
              {data.super_admins.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    {t('noActive')}
                  </CardContent>
                </Card>
              ) : (
                data.super_admins.map((admin) => (
                  <Card key={admin.id}>
                    <CardContent className="flex items-center gap-3 p-4">
                      <Avatar className="size-10">
                        <AvatarFallback>
                          {(admin.first_name?.[0] ?? '?').toUpperCase()}
                          {(admin.last_name?.[0] ?? '').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {admin.first_name} {admin.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{admin.email}</p>
                        <LastLogin lastLoginAt={admin.last_login_at} />
                      </div>
                      <TwoFactorBadge admin={admin} />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t('pendingSection', { count: String(data.pending_invitations.length) })}
            </h2>
            <div className="space-y-2">
              {data.pending_invitations.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    {t('noPending')}
                  </CardContent>
                </Card>
              ) : (
                data.pending_invitations.map((inv) => (
                  <InvitationRow key={inv.id} invitation={inv} onChanged={refresh} />
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      <InviteSuperAdminModal
        open={open}
        onOpenChange={setOpen}
        onInvited={() => {
          setOpen(false);
          refresh();
        }}
      />
    </div>
  );
}

/**
 * Une ligne d'invitation, avec ses deux actions.
 *
 * ⚠ Relancer n'est PAS « réinviter » : `resendSuperAdminInvitation` réémet
 * la ligne existante. Rappeler `inviteSuperAdmin` à la place se heurterait
 * au garde-fou de dédup du backend (409) — et créerait, s'il tombait,
 * une seconde invitation valable, ce que le ticket interdit.
 */
function InvitationRow({
  invitation,
  onChanged,
}: {
  readonly invitation: SuperAdminPendingInvitation;
  readonly onChanged: () => void;
}) {
  const t = useTranslations('superAdmin.pages.superAdmins');
  const locale = useLocale() as Locale;
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const resend = useMutation({
    mutationFn: () => resendSuperAdminInvitation(invitation.id),
    onSuccess: () => {
      toast.add({ title: t('resendSuccess', { email: invitation.email }), type: 'success' });
      onChanged();
    },
    onError: (e: ApiError) => {
      toast.add({
        title: t('resendError'),
        description: messageErreur(e, t('unknownError')),
        type: 'error',
      });
    },
  });

  const revoke = useMutation({
    mutationFn: () => revokeSuperAdminInvitation(invitation.id),
    onSuccess: () => {
      setConfirmOpen(false);
      toast.add({ title: t('cancelSuccess', { email: invitation.email }), type: 'success' });
      onChanged();
    },
    onError: (e: ApiError) => {
      setConfirmOpen(false);
      toast.add({
        title: t('cancelError'),
        description: messageErreur(e, t('unknownError')),
        type: 'error',
      });
    },
  });

  const busy = resend.isPending || revoke.isPending;
  const expiry = invitation.expires_at ? formatDate(invitation.expires_at, locale) : null;

  return (
    <Card data-testid={`invitation-${invitation.id}`}>
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        {invitation.is_expired ? (
          <MailWarning className="size-5 text-destructive" aria-hidden="true" />
        ) : (
          <Mail className="size-5 text-muted-foreground" aria-hidden="true" />
        )}

        <div className="min-w-48 flex-1">
          <p className="text-sm font-semibold text-foreground">{invitation.email}</p>
          <p className="text-xs text-muted-foreground">
            {t('invitedOn', {
              date: invitation.created_at ? formatDate(invitation.created_at, locale) : '—',
            })}
          </p>
          {expiry ? (
            <p
              className={
                invitation.is_expired
                  ? 'flex items-center gap-1 text-xs text-destructive'
                  : 'flex items-center gap-1 text-xs text-muted-foreground'
              }
            >
              <Clock className="size-3" aria-hidden="true" />
              {invitation.is_expired
                ? t('expiredOn', { date: expiry })
                : t('expiresOn', { date: expiry })}
            </p>
          ) : null}
        </div>

        {invitation.is_expired ? (
          <StatusBadge tone="danger" label={t('expiredBadge')} data-testid="invitation-state" />
        ) : (
          <StatusBadge tone="attention" label={t('invitedBadge')} data-testid="invitation-state" />
        )}

        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={t('invitationActions', { email: invitation.email })}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => resend.mutate()}
          >
            {resend.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCw className="size-4" aria-hidden="true" />
            )}
            <span>{resend.isPending ? t('resending') : t('resend')}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            <X className="size-4" aria-hidden="true" />
            <span>{t('cancel')}</span>
          </Button>
        </div>
      </CardContent>

      {/*
        L'annulation invalide un lien déjà parti par email : elle passe par
        une confirmation explicite, quand la relance — additive, réversible
        par une annulation — n'en demande aucune.
      */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmCancelTitle')}</DialogTitle>
            <DialogDescription>
              {t('confirmCancelBody', { email: invitation.email })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t('confirmCancelKeep')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate()}
            >
              {revoke.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>{t('cancelling')}</span>
                </>
              ) : (
                <span>{t('confirmCancelConfirm')}</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function LastLogin({ lastLoginAt }: { readonly lastLoginAt: string | null }) {
  const t = useTranslations('superAdmin.pages.superAdmins');
  const locale = useLocale() as Locale;

  return (
    <p className="text-xs text-muted-foreground">
      {lastLoginAt ? t('lastLoginOn', { date: formatDate(lastLoginAt, locale) }) : t('neverLoggedIn')}
    </p>
  );
}

function TwoFactorBadge({
  admin,
}: {
  admin: { two_factor_enabled: boolean; force_2fa_at_first_login: boolean };
}) {
  const t = useTranslations('superAdmin.pages.superAdmins');

  if (admin.force_2fa_at_first_login) {
    return (
      <StatusBadge
        tone="attention"
        icon={<ShieldAlert className="size-3" aria-hidden="true" />}
        label={t('badgePending2fa')}
      />
    );
  }
  if (admin.two_factor_enabled) {
    return (
      <StatusBadge
        tone="success"
        icon={<ShieldCheck className="size-3" aria-hidden="true" />}
        label={t('badgeActive')}
      />
    );
  }
  return <StatusBadge tone="neutral" label={t('badgeActiveNo2fa')} />;
}
