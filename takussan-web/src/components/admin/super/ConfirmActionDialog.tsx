'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Phrase the user must re-type to enable the confirm button (double confirmation). */
  confirmPhrase: string;
  confirmLabel: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}

/**
 * Double-confirmation modal for sensitive super-admin actions (verify /
 * suspend / impersonate). The operator must re-type the confirm phrase
 * before the primary action is enabled.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmPhrase,
  confirmLabel,
  destructive = false,
  pending = false,
  onConfirm,
}: ConfirmActionDialogProps) {
  const t = useTranslations('superAdmin.confirmDialog');
  const tCommon = useTranslations('common');
  const [typed, setTyped] = useState('');
  const enabled = typed.trim() === confirmPhrase;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setTyped('');
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-stone-700">
            {t('typePrompt')} <code className="rounded bg-stone-100 px-1">{confirmPhrase}</code>
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            data-testid="confirm-action-input"
            className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="button"
            data-testid="confirm-action-submit"
            disabled={!enabled || pending}
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {pending ? t('pending') : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
