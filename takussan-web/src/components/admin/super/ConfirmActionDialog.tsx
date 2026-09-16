'use client';

import { useId, useState } from 'react';
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
import { Input } from '@/components/ui/input';

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
  const inputId = useId();
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
          {/* Le libellé est RELIÉ au champ (il ne l'était pas), et le champ est la primitive du DS :
              l'`<input>` nu n'avait ni fond de jeton ni anneau de focus visible. */}
          <label htmlFor={inputId} className="block text-xs font-semibold text-muted-foreground">
            {t('typePrompt')} <code className="rounded bg-muted px-1 font-mono text-foreground">{confirmPhrase}</code>
          </label>
          <Input
            id={inputId}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            data-testid="confirm-action-input"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
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
