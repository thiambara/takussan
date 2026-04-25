'use client';

import { useState, useTransition } from 'react';
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
import {
  requestAccountDeletionAction,
} from '@/app/actions/account-deletion';
import type { AccountDeletionObligation, AccountDeletionRequest } from '@/lib/account-deletion';

/**
 * TCK-080 — two-step modal:
 *  Step 1: pick a reason (radio group + optional free-form note)
 *  Step 2: re-authenticate with password (+ TOTP if 2FA enabled)
 *
 * The "Supprimer définitivement" button stays disabled until both steps
 * are validated. On 422 with `obligations` we surface the list inline so
 * the user knows what to terminate first.
 */

const REASONS = ['service_completed', 'quality_issue', 'privacy', 'other'] as const;
type Reason = (typeof REASONS)[number];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether the user has 2FA active — drives the extra TOTP input. */
  twoFactorEnabled: boolean;
  /** Called when the deletion is successfully scheduled. */
  onScheduled: (request: AccountDeletionRequest) => void;
}

export function AccountDeletionDialog({ open, onOpenChange, twoFactorEnabled, onScheduled }: Props) {
  const t = useTranslations('account.deletion.dialog');
  const tErr = useTranslations('account.deletion.errors');

  const [step, setStep] = useState<1 | 2>(1);
  const [reasonCode, setReasonCode] = useState<Reason | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [obligations, setObligations] = useState<AccountDeletionObligation[] | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setStep(1);
    setReasonCode(null);
    setReasonText('');
    setPassword('');
    setTwoFactorCode('');
    setError(null);
    setObligations(null);
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function handleSubmit() {
    if (!reasonCode || !password) return;
    setError(null);
    setObligations(null);
    startTransition(async () => {
      const result = await requestAccountDeletionAction({
        password,
        reason: reasonText || undefined,
        reason_code: reasonCode,
        two_factor_code: twoFactorEnabled ? twoFactorCode : undefined,
      });
      if (!result.ok) {
        setError(result.message || tErr('generic'));
        if (result.obligations && result.obligations.length > 0) {
          setObligations(result.obligations);
        }
        return;
      }
      onScheduled(result.data);
      reset();
    });
  }

  const canSubmit = step === 2 && !!reasonCode && password.length > 0
    && (!twoFactorEnabled || twoFactorCode.length === 6);

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {step === 1 ? t('step1Description') : t('step2Description')}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <p className="font-semibold text-app-ink">{t('step1Title')}</p>
            <fieldset className="space-y-2">
              <legend className="sr-only">{t('step1Title')}</legend>
              {REASONS.map((r) => (
                <label
                  key={r}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-app-surface-3 p-3 hover:bg-app-surface-1"
                >
                  <input
                    type="radio"
                    name="reason_code"
                    value={r}
                    checked={reasonCode === r}
                    onChange={() => setReasonCode(r)}
                    className="size-4"
                  />
                  <span>{t(`reasonOptions.${r}`)}</span>
                </label>
              ))}
            </fieldset>
            {reasonCode === 'other' ? (
              <Textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder={t('reasonOtherPlaceholder')}
                rows={3}
                maxLength={2000}
              />
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="font-semibold text-app-ink">{t('step2Title')}</p>
            <div className="space-y-2">
              <Label htmlFor="account-deletion-password">{t('passwordLabel')}</Label>
              <Input
                id="account-deletion-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {twoFactorEnabled ? (
              <div className="space-y-2">
                <Label htmlFor="account-deletion-2fa">{t('twoFactorLabel')}</Label>
                <Input
                  id="account-deletion-2fa"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                />
              </div>
            ) : null}
          </div>
        )}

        {error ? (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {error}
            {obligations && obligations.length > 0 ? (
              <div className="mt-2">
                <p className="font-semibold">{t('obligationsTitle')}</p>
                <p className="text-xs">{t('obligationsHint')}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {obligations.map((o) => (
                    <li key={`${o.type}-${o.id}`}>{o.label}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {step === 2 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(1)}
              disabled={pending}
            >
              {t('back')}
            </Button>
          ) : null}
          {step === 1 ? (
            <Button
              type="button"
              variant="default"
              onClick={() => setStep(2)}
              disabled={!reasonCode}
            >
              {t('next')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="destructive"
              onClick={handleSubmit}
              disabled={!canSubmit || pending}
            >
              {t('confirmCta')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
