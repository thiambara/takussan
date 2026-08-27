'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
 */
export function InviteMemberButton({ agencyId }: { readonly agencyId: number }) {
  const t = useTranslations('admin.team.console');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="mr-1 size-4" aria-hidden="true" />
        {t('invite')}
      </Button>
      <InviteMemberDialog
        agencyId={agencyId}
        open={open}
        onOpenChange={setOpen}
        onSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
          void queryClient.invalidateQueries({ queryKey: agencyInvitationKeys.all });
        }}
      />
    </>
  );
}
