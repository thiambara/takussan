'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Ban, Loader2, MailCheck, MailPlus } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Pagination } from '@/components/console';
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
  DEFAULT_PER_PAGE,
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
 * ## Les gestes sont gardés par CAPACITÉ, des DEUX côtés
 *
 * `canManage` vient de `useCan('team.invite', agencyId)`. ⚠ Cacher un bouton
 * n'autorise rien : c'est `InvitationPolicy::revoke()` / `::resend()` qui décide,
 * et la liste elle-même reste lisible sans la capacité — voir une invitation en
 * attente n'est pas la même chose que pouvoir agir dessus.
 *
 * ⚠ Ce docblock affirmait « c'est `team.invite` qui les gouverne côté serveur »
 * alors que `InvitationPolicy` ne mentionnait AUCUNE capacité : elle jugeait sur
 * `isAgencyAdminAt()`. Un agent à qui l'agence avait délégué `team.invite`
 * (TCK-279) voyait donc les deux boutons et prenait 403 sur les deux. La policy
 * accepte désormais la capacité **en plus** du profil d'admin — les deux gardes
 * disent la même chose, et cette phrase est redevenue vraie.
 *
 * ## Une invitation MORTE reste à l'écran, et se dit morte
 *
 * La section listait `filter[status]=sent`. Une invitation périmée s'évaporait
 * donc dès que le cron `invitations:expire` la marquait — sans geste de l'admin,
 * alors que l'objectif du ticket est « il la voit tant qu'elle n'est pas
 * acceptée » — et la ré-inviter posait une SECONDE ligne. Elle reste désormais
 * listée, marquée par `is_expired` (le champ que TCK-367 a ajouté pour ça, sur
 * cette même branche), et « Relancer » la ressuscite au lieu d'en créer une
 * voisine.
 *
 * ## Le compte affiché est celui du SERVEUR
 *
 * Le badge rendait `rows.length` : à 13 invitations, dix lignes et un badge
 * « 10 ». Un compte faux à l'écran, pas seulement une troncature. Il rend
 * `meta.total`, et la pagination rend les trois autres atteignables.
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
  const [page, setPage] = useState(1);

  // Une agence sans équipe ne fait AUCUNE requête : la garde précède le hook de
  // données par `enabled`, pas par un early-return — les hooks se déclarent tous,
  // toujours, dans le même ordre.
  const isTeamAgency = agencyKind === 'standard';

  const invitationsQuery = useQuery({
    queryKey: agencyInvitationKeys.pending(agencyId, page),
    queryFn: () => fetchPendingAgencyInvitations(token ?? '', { page, perPage: DEFAULT_PER_PAGE }),
    enabled: isTeamAgency && Boolean(token),
    staleTime: 15_000,
  });

  const rows = invitationsQuery.data?.data ?? [];
  const meta = invitationsQuery.data?.meta;

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
      // Révoquer la DERNIÈRE ligne d'une page laisserait l'admin sur une page
      // qui n'existe plus : l'API rendrait une liste vide et la section se
      // replierait entièrement, alors qu'il reste des invitations en attente.
      if (rows.length === 1 && page > 1) {
        setPage(page - 1);
      }
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
          <Badge variant="secondary" data-testid="pending-invitations-count">
            {meta?.total ?? rows.length}
          </Badge>
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
              <th scope="col" className="py-2 pr-3 font-semibold">{t('columns.state')}</th>
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
                  <td className="py-2 pr-3">
                    {invitation.is_expired ? (
                      <Badge variant="destructive" data-testid={`invitation-expired-${invitation.id}`}>
                        {t('states.expired')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t('states.pending')}</Badge>
                    )}
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

      {/* La pagination est ce qui rend les invitations au-delà de la première
          page atteignables. Sans elle, à 13 invitations, trois étaient
          invisibles ET inactionnables — ni relançables, ni révocables, c'est-à-
          dire l'objectif même de cette section. `Pagination` ne rend rien sur
          une seule page. */}
      <Pagination
        className="mt-3"
        page={meta?.current_page ?? page}
        lastPage={meta?.last_page ?? 1}
        onChange={setPage}
      />

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
