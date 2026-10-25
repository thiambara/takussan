'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InviteAgentDialog } from '@/components/admin/InviteAgentDialog';
import { agencyInvitationKeys } from '@/lib/queries/agency-invitations';
import { useCan } from '@/hooks/useCan';

/**
 * Le déclencheur « Inviter » de `/app/agency/team`, autoportant.
 *
 * Il existe pour une raison d'emplacement, pas de comportement : les guidelines veulent l'action
 * principale d'un écran **en tête, à côté du titre**, et `PageHeader` expose un emplacement
 * `actions` que la console d'agence n'utilisait nulle part. La page est un server component ; ce
 * bouton porte donc lui-même l'état d'ouverture du dialogue, ce qui lui évite de remonter dans le
 * `TeamConsole` — qui n'aurait alors plus rien à voir avec la mise en page.
 *
 * L'invalidation passe par la clé `['admin-users']`, la même que celle du console : c'est ce qui
 * fait que la liste se rafraîchit alors que les deux composants ne se connaissent pas.
 *
 * TCK-368 — elle porte aussi `['agency-invitations']`, pour la même raison et par le
 * même chemin : la zone des invitations en attente vit sous ce bouton sans le
 * connaître, et doit se remettre à jour sans rechargement de page.
 *
 * TCK-392 — un seul bouton portait le libellé « Inviter » et rattachait un compte existant par
 * `POST /agencies/{id}/members`, sans ligne `invitations`. TCK-2365 (P242.01) a retiré ce
 * rattachement direct : « Inviter » (`POST /agencies/{id}/agents/invite`) est le seul geste, pour
 * un compte neuf comme pour un compte existant, au rôle agent ou administrateur.
 *
 * Le succès invalide `['admin-users']`, parce qu'une acceptation y fera apparaître une ligne, et
 * `['agency-invitations']`, parce que l'invitation s'y affiche immédiatement.
 */
interface InviteMemberButtonProps {
  readonly agencyId: number;
  /**
   * TCK-1412 (P148.02) — le compte a-t-il un rôle d'administration ? Sans lui, la page Équipe ne
   * s'ouvre que par capacité : « Inviter » exige alors `team.invite` (l'API le juge ainsi,
   * `AgentProfilePolicy::invite`).
   */
  readonly estAdmin?: boolean;
}

export function InviteMemberButton({ agencyId, estAdmin = true }: InviteMemberButtonProps) {
  const t = useTranslations('admin.team.console');
  const { can: canInvite } = useCan('team.invite', agencyId);
  const montreInviter = estAdmin || canInvite;
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    void queryClient.invalidateQueries({ queryKey: agencyInvitationKeys.all });
  };

  if (!montreInviter) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" aria-hidden="true" />
          {t('inviteAgent')}
        </Button>
      </div>
      <InviteAgentDialog
        agencyId={agencyId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={rafraichir}
      />
    </>
  );
}
