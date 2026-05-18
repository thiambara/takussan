'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, ShieldCheck, ShieldAlert, UserPlus } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InviteSuperAdminModal } from '@/components/super-admin/InviteSuperAdminModal';
import {
  fetchSuperAdminListing,
  type SuperAdminCooptationListing,
} from '@/lib/queries/super-admin';
import type { ApiError } from '@/lib/api';

/**
 * TCK-264 — Cooptation surface for super-admins.
 *
 * Lists every active super-admin alongside the pending invitations so
 * any peer can see the full pipeline (transparency by default — there
 * is no hidden super-admin in the system).
 */
export default function SuperAdminsCooptationPage() {
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-app-ink">Super-admins</h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            Cooptation entre pairs : invitez un nouveau super-admin avec activation 2FA obligatoire.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <UserPlus className="size-4" aria-hidden="true" />
          <span>Inviter un super-admin</span>
        </Button>
      </header>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 text-sm text-app-ink-muted">Chargement…</CardContent>
        </Card>
      ) : null}

      {isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-red-600">
            Impossible de charger la liste : {error?.displayMessage ?? 'Erreur inconnue'}
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-app-ink-muted">
              Actifs ({data.super_admins.length})
            </h2>
            <div className="space-y-2">
              {data.super_admins.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-app-ink-muted">
                    Aucun super-admin actif.
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
                      <StatusBadge admin={admin} />
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-app-ink-muted">
              Invitations en attente ({data.pending_invitations.length})
            </h2>
            <div className="space-y-2">
              {data.pending_invitations.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-sm text-app-ink-muted">
                    Aucune invitation en attente.
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
                          Invité le{' '}
                          {inv.created_at
                            ? new Date(inv.created_at).toLocaleDateString('fr-FR')
                            : '—'}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
                        Invité
                      </span>
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

function StatusBadge({
  admin,
}: {
  admin: { two_factor_enabled: boolean; force_2fa_at_first_login: boolean };
}) {
  if (admin.force_2fa_at_first_login) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-900">
        <ShieldAlert className="size-3" aria-hidden="true" /> En attente 2FA
      </span>
    );
  }
  if (admin.two_factor_enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-900">
        <ShieldCheck className="size-3" aria-hidden="true" /> Actif
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-xs font-medium text-stone-900">
      Actif (2FA off)
    </span>
  );
}
