'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InviteMemberDialog } from '@/components/admin/InviteMemberDialog';

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
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['admin-users'] })}
      />
    </>
  );
}
