'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TeamSuspensionAction } from '@/lib/queries/team-suspension';

interface MinimalMember {
  readonly first_name: string;
  readonly last_name: string;
}

interface ConfirmSuspendDialogProps<T extends MinimalMember> {
  readonly target: { member: T; action: TeamSuspensionAction } | null;
  readonly onCancel: () => void;
  readonly onConfirm: (member: T, action: TeamSuspensionAction) => void;
  readonly isPending?: boolean;
}

/**
 * TCK-587 — confirmation de « Suspendre de l'agence » / « Réactiver dans l'agence ».
 *
 * Le texte dit que le COMPTE n'est pas touché : c'est toute la différence avec le blocage que la
 * console proposait avant ce ticket, qui coupait le membre de toutes ses agences à la fois.
 */
export function ConfirmSuspendDialog<T extends MinimalMember>({
  target,
  onCancel,
  onConfirm,
  isPending,
}: ConfirmSuspendDialogProps<T>) {
  const t = useTranslations('admin.team.suspension');
  const name = target ? `${target.member.first_name} ${target.member.last_name}` : '';
  const suspend = target?.action === 'suspend';

  return (
    <Dialog open={target !== null} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {suspend ? t('suspendTitle', { name }) : t('reactivateTitle', { name })}
          </DialogTitle>
          <DialogDescription>
            {suspend ? t('suspendDescription', { name }) : t('reactivateDescription', { name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            {t('cancel')}
          </Button>
          <Button
            variant={suspend ? 'destructive' : 'default'}
            onClick={() => (target ? onConfirm(target.member, target.action) : undefined)}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            {suspend ? t('confirmSuspend') : t('confirmReactivate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
