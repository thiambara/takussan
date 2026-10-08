'use client';

import { useId, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/** Le motif minimal que l'API accepte (`StartImpersonationRequest`). */
export const MOTIF_MINIMUM = 10;

interface ImpersonationStartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetName: string;
  pending: boolean;
  error: unknown;
  onConfirm: (reason: string) => void;
}

/**
 * TCK-600 (ADR-0055) — démarrer une session d'impersonation : l'effet est dit en clair (lecture
 * seule, 15 minutes, la personne sera prévenue), le motif est saisi, et la phrase de confirmation
 * est TRADUITE — elle était le littéral français `IMPERSONIFIER`, servi tel quel en anglais et en
 * wolof.
 */
export function ImpersonationStartDialog({
  open,
  onOpenChange,
  targetName,
  pending,
  error,
  onConfirm,
}: ImpersonationStartDialogProps) {
  const t = useTranslations('superAdmin.pages.users');
  const tConfirm = useTranslations('superAdmin.confirmDialog');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const reasonId = useId();
  const phraseId = useId();
  const phrase = t('impersonateConfirmPhrase');
  const message = error ? messageErreur(error) : null;
  const pret = reason.trim().length >= MOTIF_MINIMUM && typed.trim() === phrase;

  return (
    <Dialog
      open={open}
      onOpenChange={(ouvert) => {
        onOpenChange(ouvert);
        if (!ouvert) {
          setReason('');
          setTyped('');
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('impersonateTitle', { name: targetName })}</DialogTitle>
          <DialogDescription className="text-pretty">{t('impersonateDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={reasonId}>{t('impersonateReasonLabel')}</Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('impersonateReasonPlaceholder')}
            maxLength={1000}
            data-testid="impersonate-reason"
          />
          <p className="text-xs text-muted-foreground">{t('impersonateReasonHint', { min: MOTIF_MINIMUM })}</p>
        </div>
        <div className="space-y-2">
          <label htmlFor={phraseId} className="block text-xs font-semibold text-muted-foreground">
            {tConfirm('typePrompt')} <code className="rounded bg-muted px-1 font-mono text-foreground">{phrase}</code>
          </label>
          <Input
            id={phraseId}
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            data-testid="confirm-action-input"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </div>
        {message ? <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            data-testid="confirm-action-submit"
            disabled={!pret || pending}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? tConfirm('pending') : t('impersonateConfirmLabel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
