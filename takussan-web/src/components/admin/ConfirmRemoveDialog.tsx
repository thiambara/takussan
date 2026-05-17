'use client';

import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
  const open = member !== null;
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retirer ce membre&nbsp;?</DialogTitle>
          <DialogDescription>
            {member
              ? `${member.full_name || `${member.first_name} ${member.last_name}`} perdra l'accès aux ressources de l'agence. Cette action est réversible en l'invitant à nouveau.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => (member ? onConfirm(member) : undefined)}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Retirer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
