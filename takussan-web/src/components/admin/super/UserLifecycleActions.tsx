'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, Trash2, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { postUserLifecycleAction, type UserLifecycleAction } from '@/lib/queries/super-admin';
import type { PlatformAbility } from '@/lib/platform-abilities';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { usePlatformAbilities } from './PlatformAbilitiesProvider';

/** La phrase à retaper (jeton technique, comparé à la frappe), le geste exigé, le rendu. */
const GESTES: Record<UserLifecycleAction, { phrase: string; ability: PlatformAbility; icon: typeof Ban; destructive: boolean }> = {
  block: { phrase: 'BLOQUER', ability: 'platform.users.block', icon: Ban, destructive: true },
  reactivate: { phrase: 'REACTIVER', ability: 'platform.users.block', icon: UserCheck, destructive: false },
  erase: { phrase: 'EFFACER', ability: 'platform.users.erase', icon: Trash2, destructive: true },
};

/**
 * TCK-600 (sous-partie 3) — bloquer, réactiver, effacer un compte depuis sa fiche. Chaque geste
 * exige un motif et la phrase retapée ; seuls ceux que le statut et le niveau permettent sont
 * proposés. Un effacement refusé liste les obligations ouvertes (dans la modale).
 */
export function UserLifecycleActions({ userId, status }: { userId: number; status: string | null }) {
  const t = useTranslations('superAdmin.userDetail.lifecycle');
  const fmt = useFormatteurs();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePlatformAbilities();
  const [pending, setPending] = useState<UserLifecycleAction | null>(null);

  const mutation = useMutation({
    mutationFn: ({ action, reason }: { action: UserLifecycleAction; reason: string }) =>
      postUserLifecycleAction(userId, action, reason),
    onSuccess: async (reponse, { action }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'user', userId] }),
        queryClient.invalidateQueries({ queryKey: ['super-admin', 'users'] }),
      ]);
      const planifie = action === 'erase' ? (reponse.data as { scheduled_for?: string | null }).scheduled_for : null;
      toast.add({
        title: planifie ? t('toastErasureScheduled', { date: fmt.date(planifie) }) : t('toastDone'),
        type: 'success',
      });
      setPending(null);
    },
  });

  if (status === 'deleted') return null;
  const actions = ([status === 'blocked' ? 'reactivate' : 'block', 'erase'] as const).filter((action) =>
    can(GESTES[action].ability),
  );
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => {
        const { icon: Icon, destructive } = GESTES[action];
        return (
          <Button
            key={action}
            type="button"
            size="sm"
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => setPending(action)}
            disabled={mutation.isPending}
          >
            <Icon className="size-4" aria-hidden="true" />
            {t(`${action}.label`)}
          </Button>
        );
      })}
      {pending ? (
        <ConfirmActionDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setPending(null);
              mutation.reset();
            }
          }}
          title={t(`${pending}.title`)}
          description={t(`${pending}.description`)}
          confirmPhrase={GESTES[pending].phrase}
          confirmLabel={t(`${pending}.label`)}
          destructive={GESTES[pending].destructive}
          pending={mutation.isPending}
          reason={{ label: t('reasonLabel') }}
          error={mutation.error}
          onConfirm={(reason) => mutation.mutate({ action: pending, reason })}
        />
      ) : null}
    </div>
  );
}
