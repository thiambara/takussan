'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { UserCheck, UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InviteAgentDialog } from '@/components/admin/InviteAgentDialog';
import { InviteMemberDialog } from '@/components/admin/InviteMemberDialog';
import { agencyInvitationKeys } from '@/lib/queries/agency-invitations';

/**
 * Le déclencheur « Inviter » de `/admin/team`, autoportant.
 *
 * Il existe pour une raison d'emplacement, pas de comportement : les guidelines veulent l'action
 * principale d'un écran **en tête, à côté du titre**, et `PageHeader` expose un emplacement
 * `actions` que la console `/admin` n'utilisait nulle part. La page est un server component ; ce
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
 * TCK-392 — il y a désormais DEUX gestes, et ils ne se remplacent pas :
 *
 * | Geste | Endpoint | Ce qu'il exige de la personne |
 * |---|---|---|
 * | « Inviter » | `POST /agencies/{id}/agents/invite` | rien — elle crée son compte en acceptant |
 * | « Ajouter un compte existant » | `POST /agencies/{id}/members` | un compte Takussan déjà inscrit |
 *
 * Un seul bouton portait le libellé « Inviter » et exécutait le SECOND : aucune
 * ligne `invitations` n'était écrite depuis cet écran, et la zone livrée par
 * TCK-368 ne pouvait être alimentée que par les assistants Propriétaire et
 * Prestataire. *Les deux chemins sont désormais distincts à l'écran parce qu'ils
 * l'ont toujours été dans l'API.*
 *
 * Les deux invalident les mêmes clés : `['admin-users']` parce qu'une acceptation
 * y fera apparaître une ligne, `['agency-invitations']` parce que l'invitation s'y
 * affiche immédiatement.
 */
export function InviteMemberButton({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('admin.team.console');
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addExistingOpen, setAddExistingOpen] = useState(false);

  const rafraichir = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    void queryClient.invalidateQueries({ queryKey: agencyInvitationKeys.all });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-1 size-4" aria-hidden="true" />
          {t('inviteAgent')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAddExistingOpen(true)}>
          <UserCheck className="mr-1 size-4" aria-hidden="true" />
          {t('addExisting')}
        </Button>
      </div>
      <InviteAgentDialog
        agencyId={agencyId}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={rafraichir}
      />
      <InviteMemberDialog
        agencyId={agencyId}
        open={addExistingOpen}
        onOpenChange={setAddExistingOpen}
        onSuccess={rafraichir}
      />
    </>
  );
}
