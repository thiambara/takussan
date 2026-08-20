'use client';

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface MinimalMember {
  readonly first_name: string;
  readonly last_name: string;
  readonly full_name?: string;
}

interface ConfirmRemoveDialogProps<T extends MinimalMember> {
  readonly member: T | null;
  readonly onCancel: () => void;
  readonly onConfirm: (member: T) => void;
  readonly isPending?: boolean;
}

export function ConfirmRemoveDialog<T extends MinimalMember>({
  member,
  onCancel,
  onConfirm,
  isPending,
}: ConfirmRemoveDialogProps<T>) {
  const t = useTranslations('admin.team');
  const open = member !== null;
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('removeDialog.title')}</DialogTitle>
          <DialogDescription>
            {member
              ? t('removeDialog.description', {
                name: member.full_name || `${member.first_name} ${member.last_name}`,
              })
              : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            {t('removeDialog.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => (member ? onConfirm(member) : undefined)}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('removeDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
