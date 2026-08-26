'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, ShieldCheck, ShieldAlert, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InviteSuperAdminModal } from '@/components/super-admin/InviteSuperAdminModal';
import {
  fetchSuperAdminListing,
  type SuperAdminCooptationListing,
} from '@/lib/queries/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader, StatusBadge } from '@/components/console';

/**
 * TCK-264 — Cooptation surface for super-admins.
 *
 * Lists every active super-admin alongside the pending invitations so
 * any peer can see the full pipeline (transparency by default — there
 * is no hidden super-admin in the system).
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
          <CardContent className="p-6 text-sm text-app-ink-muted">{t('loading')}</CardContent>
        </Card>
      ) : null}

      {isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-red-600">
            {t('loadError')} {messageErreur(error, t('unknownError'))}
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-app-ink-muted">
              {t('activeSection', { count: String(data.super_admins.length) })}
            </h2>
            <div className="space-y-2">
              {data.super_admins.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-app-ink-muted">
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
                        <p className="text-sm font-semibold text-app-ink">
                          {admin.first_name} {admin.last_name}
                        </p>
                        <p className="text-xs text-app-ink-muted">{admin.email}</p>
                      </div>
                      <TwoFactorBadge admin={admin} />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-app-ink-muted">
              {t('pendingSection', { count: String(data.pending_invitations.length) })}
            </h2>
            <div className="space-y-2">
              {data.pending_invitations.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-app-ink-muted">
                    {t('noPending')}
                  </CardContent>
                </Card>
              ) : (
                data.pending_invitations.map((inv) => (
                  <Card key={inv.id}>
                    <CardContent className="flex items-center gap-3 p-4">
                      <Mail className="size-5 text-app-ink-muted" aria-hidden="true" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-app-ink">{inv.email}</p>
                        <p className="text-xs text-app-ink-muted">
                          {t('invitedOn', {
                            date: inv.created_at
                              ? new Date(inv.created_at).toLocaleDateString('fr-FR')
                              : '—',
                          })}
                        </p>
                      </div>
                      <StatusBadge tone="attention" label={t('invitedBadge')} />
                    </CardContent>
                  </Card>
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
