'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, Loader2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  superAdminTwoFactorConfirmAction,
  superAdminTwoFactorEnrollAction,
} from '@/app/actions/super-admin-cooptation';

/**
 * TCK-264 — Mandatory TOTP enrollment wizard for a freshly-coopted
 * super-admin.
 *
 * Mirrors the {@link TotpEnrollment} state machine (intro → scanning →
 * success) but talks to the dedicated `/api/auth/super-admin/2fa/{enroll,
 * confirm}` endpoints so the spatie `super_admin` role is attached as
 * part of the same `confirm` round-trip.
 *
 * Two specifics vs the standard TotpEnrollment flow:
 *  - **Forced** mode (no skip) — the page is the user's only legal
 *    landing zone post-acceptance and the role isn't attached until
 *    they finish enrolling.
 *  - **Recovery codes** are returned by `/enroll` (never by `/confirm`,
 *    which only flips the role on); we stash them on `enroll` and
 *    surface them on the success panel.
 */
export interface SuperAdminOnboardingWizardProps {
  readonly firstName?: string | null;
}

type Stage = 'intro' | 'scanning' | 'success';

interface SetupPayload {
  readonly secret: string;
  readonly qrSvg: string | null;
  readonly qrUrl: string;
  readonly recoveryCodes: string[];
}

export function SuperAdminOnboardingWizard({ firstName }: SuperAdminOnboardingWizardProps) {
  const router = useRouter();
  const t = useTranslations('auth.twoFactor');
  const [stage, setStage] = useState<Stage>('intro');
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [code, setCode] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleStart = useCallback(() => {
    setError(null);
    startTransition(async () => {
      const result = await superAdminTwoFactorEnrollAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSetup({
        secret: result.data.secret,
        qrSvg: result.data.qr_svg ?? null,
        qrUrl: result.data.qr_url,
        recoveryCodes: result.data.recovery_codes,
      });
      setStage('scanning');
    });
  }, []);

  const handleConfirm = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      startTransition(async () => {
        const result = await superAdminTwoFactorConfirmAction(code);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setStage('success');
      });
    },
    [code],
  );

  const handleDownloadCodes = useCallback(() => {
    if (typeof document === 'undefined' || !setup || setup.recoveryCodes.length === 0) return;
    const content = [
      t('recovery.fileHeader'),
      '',
      ...setup.recoveryCodes,
      '',
      t('recovery.fileFooter'),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'takussan-super-admin-recovery-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [setup, t]);

  const handleFinish = useCallback(() => {
    router.replace('/super-admin');
  }, [router]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <ShieldCheck className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-app-ink">
          Activation super-admin{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-sm text-app-ink-muted">
          La double authentification est obligatoire avant d’accéder à la console super-admin.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-app-surface-3 bg-white p-6 shadow-sm">
        {stage === 'intro' ? (
          <div className="space-y-4">
            <p className="text-sm text-app-ink-muted">{t('intro.description')}</p>
            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}
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
          </div>
        ) : null}

        {stage === 'scanning' && setup ? (
          <form onSubmit={handleConfirm} className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-app-ink">{t('scan.title')}</h2>
              <p className="mt-1 text-sm text-app-ink-muted">{t('scan.description')}</p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {setup.qrSvg ? (
                // eslint-disable-next-line @next/next/no-img-element -- inline SVG data URI.
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
            <div
              role="status"
              className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
            >
              <p className="font-semibold">{t('recovery.title')}</p>
              <p className="mt-1 text-xs">{t('recovery.warning')}</p>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm">
                {setup.recoveryCodes.map((codeValue) => (
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
            <div className="space-y-1">
              <label htmlFor="super-admin-totp-code" className="text-xs font-semibold text-app-ink-muted">
                {t('scan.codeLabel')}
              </label>
              <Input
                id="super-admin-totp-code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
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
            <Button type="submit" disabled={pending || code.length !== 6 || !acknowledged}>
              {pending ? t('scan.verifying') : t('scan.cta')}
            </Button>
          </form>
        ) : null}

        {stage === 'success' ? (
          <div className="space-y-4 text-center">
            <ShieldCheck className="mx-auto size-12 text-emerald-600" aria-hidden="true" />
            <h2 className="text-base font-semibold text-app-ink">{t('success.title')}</h2>
            <p className="text-sm text-app-ink-muted">
              Le rôle super-admin vient d’être attaché à votre compte.
            </p>
            <Button onClick={handleFinish}>{t('success.cta')}</Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
