'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  twoFactorConfirmAction,
  twoFactorDisableAction,
  twoFactorEnableAction,
  twoFactorRegenerateAction,
} from '@/app/actions/security';

/**
 * TCK-069 — 2FA sub-section.
 *
 * Three states:
 *  - disabled  → "Activer la 2FA" button.
 *  - setup     → enabled but not confirmed: show secret + otpauth URL + 6-digit code form.
 *  - active    → "Désactiver" + "Régénérer les codes de récupération".
 *
 * Recovery codes are only shown immediately after confirm/regenerate — the
 * backend never re-emits them (security invariant).
 */

interface TwoFactorSectionProps {
  enabled: boolean;
}

export function TwoFactorSection({ enabled: initialEnabled }: TwoFactorSectionProps) {
  const t = useTranslations('profile.security.twoFactor');
  const tCommon = useTranslations('common.actions');
  const [enabled, setEnabled] = useState(initialEnabled);
  const [setup, setSetup] = useState<{
    secret: string;
    qrUrl: string;
    qrSvg: string | null;
  } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleEnable() {
    setError(null);
    startTransition(async () => {
      const result = await twoFactorEnableAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      // TCK-078 — prefer the inline SVG data URI returned by the API
      // (no external call); keep qr_url for the manual-paste fallback.
      setSetup({
        secret: result.data.secret,
        qrUrl: result.data.qr_url,
        qrSvg: result.data.qr_svg ?? null,
      });
    });
  }

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await twoFactorConfirmAction(code);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEnabled(true);
      setSetup(null);
      setCode('');
      setRecoveryCodes(result.data.recovery_codes);
    });
  }

  function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await twoFactorDisableAction({ password: disablePassword });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEnabled(false);
      setShowDisable(false);
      setDisablePassword('');
      setRecoveryCodes(null);
    });
  }

  function handleRegenerate() {
    setError(null);
    startTransition(async () => {
      const result = await twoFactorRegenerateAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setRecoveryCodes(result.data.recovery_codes);
    });
  }

  // TCK-078 — QR is now rendered server-side via bacon/bacon-qr-code and
  // returned as an inline SVG data URI. This keeps the TOTP secret on our
  // infra (the previous api.qrserver.com proxy leaked it to a third party
  // and added an external availability dependency). The otpauth URL stays
  // around as a copy-paste fallback below the image.
  const qrImageSrc = setup?.qrSvg ?? null;

  return (
    <div className="rounded-2xl border border-app-surface-3 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-app-ink">
            {t('title')}
          </h3>
          <p className="mt-1 text-sm text-app-ink-muted">
            {t('description')}
          </p>
        </div>
        <span
          className={
            'rounded-full px-2 py-1 text-xs font-semibold ' +
            (enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-app-surface-1 text-app-ink-muted')
          }
        >
          {enabled ? t('enabled') : t('disabled')}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      {!enabled && !setup ? (
        <div className="mt-4">
          <Button onClick={handleEnable} disabled={pending}>
            {pending ? t('initializing') : t('enable')}
          </Button>
        </div>
      ) : null}

      {setup ? (
        <form onSubmit={handleConfirm} className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {qrImageSrc ? (
              <img
                src={qrImageSrc}
                alt={t('qrAlt')}
                width={200}
                height={200}
                className="rounded-md border border-app-surface-3"
              />
            ) : null}
            <div className="space-y-2 text-sm">
              <p className="text-app-ink-muted">
                {t('scanHint')}
              </p>
              <code className="block break-all rounded-md bg-app-surface-1 px-2 py-1 font-mono text-xs">
                {setup.secret}
              </code>
              <p className="text-xs text-app-ink-muted">
                {t('confirmHint')}
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="totp-code" className="text-xs font-semibold text-app-ink-muted">
              {t('codeLabel')}
            </label>
            <Input
              id="totp-code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              autoComplete="one-time-code"
              required
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={pending || code.length !== 6}>
              {pending ? t('verifying') : t('confirmAndEnable')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSetup(null);
                setCode('');
              }}
              disabled={pending}
            >
              {tCommon('cancel')}
            </Button>
          </div>
        </form>
      ) : null}

      {recoveryCodes ? (
        <div
          role="status"
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">{t('recoveryTitle')}</p>
          <p className="mt-1 text-xs">
            {t('recoveryHint')}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-sm">
            {recoveryCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(recoveryCodes.join('\n'))}
            className="mt-3 rounded-md bg-amber-200 px-3 py-1 text-xs font-semibold hover:bg-amber-300"
          >
            {t('copyAll')}
          </button>
        </div>
      ) : null}

      {enabled && !setup ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRegenerate} disabled={pending}>
            {t('regenerate')}
          </Button>
          {!showDisable ? (
            <Button
              variant="ghost"
              onClick={() => setShowDisable(true)}
              className="text-red-600 hover:text-red-700"
              disabled={pending}
            >
              {t('disable')}
            </Button>
          ) : (
            <form onSubmit={handleDisable} className="flex w-full flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                placeholder={t('passwordPlaceholder')}
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <Button type="submit" variant="outline" disabled={pending || !disablePassword}>
                {t('confirmDisable')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowDisable(false);
                  setDisablePassword('');
                }}
                disabled={pending}
              >
                {tCommon('cancel')}
              </Button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
