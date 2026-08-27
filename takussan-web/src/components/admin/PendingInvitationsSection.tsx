'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Ban, Loader2, MailCheck, MailPlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import {
  agencyInvitationKeys,
  fetchPendingAgencyInvitations,
  resendInvitation,
  revokeInvitation,
  type PendingAgencyInvitation,
} from '@/lib/queries/agency-invitations';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-368 — les invitations en attente de l'agence, dans la console Équipe.
 *
 * ## Une zone distincte, et qui disparaît
 *
 * Une invitation n'est pas un membre : elle n'a ni compte, ni profil, ni rôle
 * effectif. La mélanger aux lignes d'`AdminUsersTable` ferait porter aux colonnes
 * « statut » et « rôle » deux sens différents selon la ligne. La zone vit donc
 * au-dessus du tableau, et **elle n'est pas rendue du tout** quand il n'y a rien
 * en attente : un bloc vide permanent au-dessus de chaque console Équipe coûterait
 * une place qu'aucun écran ne rembourse.
 *
 * ## L'agence `individual` : absence, pas erreur
 *
 * Une agence `individual` n'a pas d'équipe ([§1.12](docs/features.md)) et
 * `AgentInvitationService::assertAgencyCanInvite()` rend 403 à toute tentative. La
 * section ne s'affiche pas — sans message, sans état vide, sans explication : il
 * n'y a rien à expliquer à quelqu'un qui n'a jamais eu cette fonctionnalité.
 *
 * ⚠ La page redirige DÉJÀ ces agences vers `/app`
 * (`ensureStandardAgencyOrRedirect`). Le test ici est donc redondant en pratique —
 * et c'est voulu : la redondance coûte une comparaison de chaîne, alors qu'une
 * garde unique dont on hérite le jour où la page bouge coûte une fuite.
 *
 * ## Les gestes sont gardés par CAPACITÉ, pas par type de profil
 *
 * `canManage` vient de `useCan('team.invite', agencyId)`. ⚠ Cacher un bouton
 * n'autorise rien : c'est `InvitationPolicy::revoke()` / `::resend()` qui décide,
 * et la liste elle-même reste lisible sans la capacité — voir une invitation en
 * attente n'est pas la même chose que pouvoir agir dessus.
 *
 * ## La relance ne se confirme pas, la révocation si
 *
 * Une relance renvoie le même e-mail avec un nouveau jeton : le pire qu'elle
 * produise est un doublon dans une boîte de réception, et une seconde révocation
 * la défait. Une révocation, elle, invalide le lien déjà parti — irréversible pour
 * le destinataire, qui verra un 410 s'il clique. *On ne confirme que ce qu'on ne
 * peut pas défaire.*
 */

interface PendingInvitationsSectionProps {
  readonly agencyId: number;
  /** `kind` de l'agence active. Tout ce qui n'est pas `standard` masque la zone. */
  readonly agencyKind: string | null;
  /** `team.invite` dans cette agence — garde les DEUX gestes, pas la lecture. */
  readonly canManage: boolean;
}

/** Les rôles qu'une invitation peut porter (`CreateInvitationRequest::rules()` + `AgentInvitationService::ALLOWED_ROLES`). */
const ROLE_LABEL_KEYS = new Set([
  'owner',
  'agent',
  'agent_senior',
  'agent_manager',
  'agency_admin',
  'service_provider',
]);

export function PendingInvitationsSection({
  agencyId,
  agencyKind,
  canManage,
}: PendingInvitationsSectionProps) {
  const t = useTranslations('admin.team.invitations');
  const tCommon = useTranslations('common.actions');
  const locale = useLocale() as Locale;
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();

  const [pendingRevoke, setPendingRevoke] = useState<PendingAgencyInvitation | null>(null);

  // Une agence sans équipe ne fait AUCUNE requête : la garde précède le hook de
  // données par `enabled`, pas par un early-return — les hooks se déclarent tous,
  // toujours, dans le même ordre.
  const isTeamAgency = agencyKind === 'standard';

  const invitationsQuery = useQuery({
    queryKey: agencyInvitationKeys.pending(agencyId),
    queryFn: () => fetchPendingAgencyInvitations(token ?? ''),
    enabled: isTeamAgency && Boolean(token),
    staleTime: 15_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: agencyInvitationKeys.all });

  const resendMutation = useMutation<unknown, ApiError, PendingAgencyInvitation>({
    mutationFn: (invitation) => resendInvitation(token ?? '', invitation.id),
    onSuccess: async (_data, invitation) => {
      toast.add({
        title: t('toasts.resendSuccess', { email: invitation.email }),
        type: 'success',
      });
      // La relance repousse `expires_at` et remet `last_reminded_at` à null : la
      // ligne affichée est périmée même si elle ne disparaît pas.
      await invalidate();
    },
    onError: (error) => {
      toast.add({
        title: t('toasts.errorTitle'),
        description: messageErreur(error),
        type: 'error',
      });
    },
  });

  const revokeMutation = useMutation<unknown, ApiError, PendingAgencyInvitation>({
    mutationFn: (invitation) => revokeInvitation(token ?? '', invitation.id),
    onSuccess: async (_data, invitation) => {
      setPendingRevoke(null);
      toast.add({
        title: t('toasts.revokeSuccess', { email: invitation.email }),
        type: 'success',
      });
      await invalidate();
    },
    onError: (error) => {
      setPendingRevoke(null);
      toast.add({
        title: t('toasts.errorTitle'),
        description: messageErreur(error),
        type: 'error',
      });
    },
  });

  if (!isTeamAgency) return null;

  const rows = invitationsQuery.data?.data ?? [];

  // Le chargement ne montre qu'une bande de squelette, sans titre : afficher
  // « Invitations en attente » avant de savoir s'il y en a fait apparaître puis
  // disparaître un en-tête à chaque visite de l'écran.
  if (invitationsQuery.isLoading) {
    return (
      <Skeleton
        className="h-10 w-full"
        aria-hidden="true"
        data-testid="pending-invitations-loading"
      />
    );
  }

  if (invitationsQuery.isError) {
    return (
      <ErrorState
        message={messageErreur(invitationsQuery.error, t('error'))}
        onRetry={() => void invitationsQuery.refetch()}
        retryLabel={tCommon('retry')}
      />
    );
  }

  // « Se replie quand elle est vide » — jusqu'à ne rien rendre du tout.
  if (rows.length === 0) return null;

  const roleLabel = (role: string): string =>
    ROLE_LABEL_KEYS.has(role) ? t(`roles.${role}`) : role;

  return (
    <section
      data-testid="pending-invitations"
      aria-labelledby="pending-invitations-title"
      className="rounded-xl border border-dashed border-border bg-muted/30 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="pending-invitations-title"
          className="flex items-center gap-2 text-sm font-semibold text-foreground"
        >
          <MailPlus className="size-4 text-muted-foreground" aria-hidden="true" />
          {t('title')}
          <Badge variant="secondary">{rows.length}</Badge>
        </h2>
        <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* TCK-371 vise la troncature sur mobile : la table défile DANS son cadre,
          le corps de la page ne défile jamais horizontalement. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-semibold">{t('columns.email')}</th>
              <th scope="col" className="py-2 pr-3 font-semibold">{t('columns.role')}</th>
              <th scope="col" className="py-2 pr-3 font-semibold">{t('columns.sentAt')}</th>
              {canManage ? (
                <th scope="col" className="py-2 text-right font-semibold">
                  {t('columns.actions')}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((invitation) => {
              const busy =
                (resendMutation.isPending && resendMutation.variables?.id === invitation.id)
                || (revokeMutation.isPending && revokeMutation.variables?.id === invitation.id);

              return (
                <tr key={invitation.id} data-testid={`pending-invitation-${invitation.id}`}>
                  <td className="py-2 pr-3 font-medium text-foreground">{invitation.email}</td>
                  <td className="py-2 pr-3">
                    <Badge variant="outline">{roleLabel(invitation.role)}</Badge>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {invitation.created_at ? formatDate(invitation.created_at, locale) : '—'}
                  </td>
                  {canManage ? (
                    <td className="py-2 text-right">
                      <div className="inline-flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => resendMutation.mutate(invitation)}
                        >
                          {busy && resendMutation.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <MailCheck className="size-3.5" aria-hidden="true" />
                          )}
                          {t('actions.resend')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setPendingRevoke(invitation)}
                        >
                          <Ban className="size-3.5" aria-hidden="true" />
                          {t('actions.revoke')}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog
        open={pendingRevoke !== null}
        onOpenChange={(next) => (!next ? setPendingRevoke(null) : undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('revokeDialog.title')}</DialogTitle>
            <DialogDescription>
              {pendingRevoke
                ? t('revokeDialog.description', { email: pendingRevoke.email })
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingRevoke(null)}
              disabled={revokeMutation.isPending}
            >
              {t('revokeDialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                pendingRevoke ? revokeMutation.mutate(pendingRevoke) : undefined}
              disabled={revokeMutation.isPending}
            >
              {revokeMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t('revokeDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
