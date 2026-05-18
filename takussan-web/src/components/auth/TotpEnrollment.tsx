'use client';

import { useCallback, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Download, ShieldCheck, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  twoFactorConfirmAction,
  twoFactorEnableAction,
} from '@/app/actions/security';

/**
 * TCK-270 — Reusable TOTP enrollment flow.
 *
 * Originally specced as a TCK-264 deliverable; pulled forward here because
 * TCK-270 lands the agency_admin onboarding step that needs it. TCK-264
 * (super-admin coopt 2FA enforcement) will reuse this component verbatim
 * by passing `mode="forced"` and omitting `onSkip`.
 *
 * State machine:
 *   intro      → user clicks "Configurer"
 *   enrolling  → calling /two-factor/enable (one-shot transition)
 *   scanning   → QR + secret displayed, user types the 6-digit code
 *   confirming → calling /two-factor/confirm
 *   success    → recovery codes shown, must check the "saved" box to finish
 *
 * Recovery codes are surfaced **once**: the backend stores them encrypted and
 * never re-emits them outside of the regenerate endpoint, so the user has to
 * actually save them before the "Continuer" button unlocks.
 */

export type TotpEnrollmentMode = 'recommended' | 'forced';

export interface TotpEnrollmentProps {
  readonly mode: TotpEnrollmentMode;
  /** Called once the user has confirmed the code AND ack'd the recovery codes. */
  readonly onComplete: () => void;
  /** Only honoured when `mode === 'recommended'` — wired to the "Plus tard" button. */
  readonly onSkip?: () => void;
}

type Stage = 'intro' | 'scanning' | 'success';

interface SetupPayload {
  readonly secret: string;
  readonly qrSvg: string | null;
  readonly qrUrl: string;
}

export function TotpEnrollment({ mode, onComplete, onSkip }: TotpEnrollmentProps) {
  const t = useTranslations('auth.twoFactor');
  const [stage, setStage] = useState<Stage>('intro');
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleStart = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await twoFactorEnableAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSetup({
        secret: result.data.secret,
        qrSvg: result.data.qr_svg ?? null,
        qrUrl: result.data.qr_url,
      });
      setStage('scanning');
    });
  }, []);

  const handleConfirm = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      startTransition(async () => {
        const result = await twoFactorConfirmAction(code);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setRecoveryCodes(result.data.recovery_codes);
        setStage('success');
      });
    },
    [code],
  );

  const handleDownloadCodes = useCallback(() => {
    if (typeof document === 'undefined' || recoveryCodes.length === 0) return;
    const content = [
      t('recovery.fileHeader'),
      '',
      ...recoveryCodes,
      '',
      t('recovery.fileFooter'),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'takussan-recovery-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [recoveryCodes, t]);

  if (stage === 'intro') {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div>
            <h3 className="text-base font-semibold text-app-ink">{t('intro.title')}</h3>
            <p className="mt-1 text-sm text-app-ink-muted">{t('intro.description')}</p>
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleStart} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>{t('intro.starting')}</span>
              </>
            ) : (
              <span>{t('intro.cta')}</span>
            )}
          </Button>
          {mode === 'recommended' && onSkip ? (
            <Button type="button" variant="ghost" onClick={onSkip} disabled={pending}>
              {t('intro.skip')}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (stage === 'scanning' && setup) {
    return (
      <form onSubmit={handleConfirm} className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-app-ink">{t('scan.title')}</h3>
          <p className="mt-1 text-sm text-app-ink-muted">{t('scan.description')}</p>
        </div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {setup.qrSvg ? (
            // eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI, no remote loader.
            <img
              src={setup.qrSvg}
              alt={t('scan.qrAlt')}
              width={180}
              height={180}
              className="rounded-md border border-app-surface-3 bg-white"
            />
          ) : null}
          <div className="space-y-2 text-sm">
            <p className="text-app-ink-muted">{t('scan.manualHint')}</p>
            <code className="block break-all rounded-md bg-app-surface-1 px-2 py-1 font-mono text-xs">
              {setup.secret}
            </code>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="totp-enrollment-code" className="text-xs font-semibold text-app-ink-muted">
            {t('scan.codeLabel')}
          </label>
          <Input
            id="totp-enrollment-code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
            }
            placeholder="123456"
            autoComplete="one-time-code"
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || code.length !== 6}>
            {pending ? t('scan.verifying') : t('scan.cta')}
          </Button>
          {mode === 'recommended' && onSkip ? (
            <Button type="button" variant="ghost" onClick={onSkip} disabled={pending}>
              {t('intro.skip')}
            </Button>
          ) : null}
        </div>
      </form>
    );
  }

  if (stage === 'success') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-app-ink">{t('success.title')}</h3>
          <p className="mt-1 text-sm text-app-ink-muted">{t('success.description')}</p>
        </div>
        <div
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">{t('recovery.title')}</p>
          <p className="mt-1 text-xs">{t('recovery.warning')}</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm">
            {recoveryCodes.map((codeValue) => (
              <li key={codeValue}>{codeValue}</li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleDownloadCodes}>
              <Download className="size-4" aria-hidden="true" />
              <span>{t('recovery.download')}</span>
            </Button>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-app-ink">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            className="mt-0.5 size-4 cursor-pointer rounded border-input accent-primary"
          />
          <span>{t('recovery.ack')}</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onComplete} disabled={!acknowledged}>
            {t('success.cta')}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
