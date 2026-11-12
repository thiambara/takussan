'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  agencyInvitationKeys,
  fetchInvitationDuClient,
  resendInvitation,
  revokeInvitation,
  type PendingAgencyInvitation,
} from '@/lib/queries/agency-invitations';
import { inviteCustomerToAccount } from '@/lib/queries/customers';

interface InviterACreerSonCompteProps {
  readonly customerId: number;
}

export type EtatDeLInvitation = 'aucune' | 'envoyee' | 'expiree';

/**
 * TCK-2668 — la dernière invitation sans réponse du client à créer son compte, lue une fois pour la
 * ligne repliée du dossier (« Invitation expirée ») et pour son contenu. La page Équipe ne liste
 * plus les invitations de locataires : elles se suivent ici.
 */
export function useInvitationDuClient(customerId: number, actif = true) {
  const { token } = useAuth();
  const lecture = useQuery({
    queryKey: agencyInvitationKeys.duClient(customerId),
    queryFn: () => fetchInvitationDuClient(token ?? '', customerId),
    enabled: actif && Boolean(token),
    retry: false,
    staleTime: 15_000,
  });
  const invitation = lecture.data ?? null;
  const etat: EtatDeLInvitation = invitation === null ? 'aucune' : invitation.is_expired ? 'expiree' : 'envoyee';
  return { lecture, invitation, etat };
}

/**
 * P15.01 (TCK-2351) — « inviter le locataire à créer son compte », depuis une fiche sans compte.
 *
 * Une fiche saisie par l'agence n'avait jamais de compte : sur son bail, « Demander la signature »
 * rendait 422, et l'espace du locataire restait vide. L'API envoie un lien à usage unique à la
 * coordonnée de la fiche, et relie le compte à l'acceptation. L'écran ne juge rien : il affiche le
 * refus de l'API tel qu'elle le dit (fiche déjà liée, aucune coordonnée, invitation en attente).
 *
 * TCK-2668 — l'état de l'invitation déjà partie : « Invitation envoyée le …, expire le … » ou
 * « Invitation expirée le … », avec « Relancer » (l'API la ressuscite, sans en créer une voisine) et
 * « Annuler » (confirmé : le lien parti cesse de fonctionner). Tant qu'une invitation est sans
 * réponse, « Inviter à créer son compte » cède sa place à « Relancer » : l'API refuserait la seconde.
 * Les trois gestes passent par la double authentification de l'agence, comme sur la page Équipe.
 */
export function InviterACreerSonCompte({ customerId }: InviterACreerSonCompteProps) {
  const t = useTranslations('crm.customerDetail.inviteAccount');
  const { token } = useAuth();
  const garde = useGardeDoubleFacteur();
  const queryClient = useQueryClient();
  const messageErreur = useMessageErreurApi();
  const { jourMois } = useFormatteurs();
  const { invitation, etat } = useInvitationDuClient(customerId);
  const [aAnnuler, setAAnnuler] = useState<PendingAgencyInvitation | null>(null);

  const relire = () => queryClient.invalidateQueries({ queryKey: agencyInvitationKeys.all });
  const inviter = useMutation<void, ApiError, void>({
    mutationFn: () => inviteCustomerToAccount(token ?? '', customerId),
    onSuccess: () => void relire(),
  });
  const relancer = useMutation<unknown, ApiError, PendingAgencyInvitation>({
    mutationFn: (i) => avecGardeDoubleFacteur(() => resendInvitation(token ?? '', i.id), garde),
    onSuccess: () => void relire(),
  });
  const annuler = useMutation<unknown, ApiError, PendingAgencyInvitation>({
    mutationFn: (i) => avecGardeDoubleFacteur(() => revokeInvitation(token ?? '', i.id), garde),
    onSettled: () => setAAnnuler(null),
    onSuccess: () => void relire(),
  });
  const erreur = inviter.error ?? relancer.error ?? annuler.error;

  if (invitation && etat !== 'aucune') {
    return (
      <div className="flex flex-col items-start gap-2" data-testid="invitation-du-client">
        <p className="text-sm">
          <span className="font-semibold">{etat === 'expiree' ? t('expiree') : t('envoyee')}</span>
          <span className="text-muted-foreground">
            {' · '}
            {etat === 'expiree'
              ? t('expireeLe', { date: jourMois(invitation.expires_at) })
              : [
                  invitation.created_at ? t('envoyeeLe', { date: jourMois(invitation.created_at) }) : null,
                  invitation.expires_at ? t('expireLe', { date: jourMois(invitation.expires_at) }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        </p>
        {relancer.isSuccess ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t('relancee')}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={relancer.isPending} onClick={() => relancer.mutate(invitation)}>
            {relancer.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
            {t('relancer')}
          </Button>
          <Button type="button" variant="outline" className="min-h-11" disabled={annuler.isPending} onClick={() => setAAnnuler(invitation)}>
            {t('annuler')}
          </Button>
        </div>
        {erreur ? (
          <p role="alert" className="max-w-prose text-sm text-destructive">
            {messageErreur(erreur, t('failed'))}
          </p>
        ) : null}
        <Dialog open={aAnnuler !== null} onOpenChange={(o) => (o ? null : setAAnnuler(null))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('annulerTitre')}</DialogTitle>
              <DialogDescription>{t('annulerDetail')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAAnnuler(null)} disabled={annuler.isPending}>
                {t('conserver')}
              </Button>
              <Button variant="destructive" onClick={() => aAnnuler && annuler.mutate(aAnnuler)} disabled={annuler.isPending}>
                {t('annulerConfirmer')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Partie, mais pas encore relue (ou illisible : l'API ne montre à un agent sans `team.invite` que
  // ses propres invitations) : le geste ne repart pas, l'API le refuserait.
  if (inviter.isSuccess) {
    return (
      <p role="status" className="max-w-prose text-sm text-muted-foreground">
        {t('sent')}
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {annuler.isSuccess ? (
        <p role="status" className="max-w-prose text-sm text-muted-foreground">
          {t('annulee')}
        </p>
      ) : null}
      <Button type="button" variant="outline" className="min-h-11" onClick={() => inviter.mutate()} disabled={inviter.isPending}>
        <UserPlus aria-hidden="true" />
        {inviter.isPending ? t('sending') : t('action')}
      </Button>
      {erreur ? (
        <p role="alert" className="max-w-prose text-sm text-destructive">
          {messageErreur(erreur, t('failed'))}
        </p>
      ) : null}
    </div>
  );
}
