'use client';

import { useState, useTransition } from 'react';
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
  const [enabled, setEnabled] = useState(initialEnabled);
  const [setup, setSetup] = useState<{ secret: string; qrUrl: string } | null>(null);
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
      setSetup({ secret: result.data.secret, qrUrl: result.data.qr_url });
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

  // Google Chart / qrserver used as a one-off QR renderer so we don't pull
  // in a dedicated JS lib — the otpauth URL stays available as a copy fallback.
  const qrImageSrc = setup
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setup.qrUrl)}`
    : null;

  return (
    <div className="rounded-2xl border border-app-surface-3 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-app-ink">
            Authentification à deux facteurs (TOTP)
          </h3>
          <p className="mt-1 text-sm text-app-ink-muted">
            Protégez votre compte avec une application d&apos;authentification
            (Google Authenticator, 1Password, Authy…).
          </p>
        </div>
        <span
          className={
            'rounded-full px-2 py-1 text-xs font-semibold ' +
            (enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-app-surface-1 text-app-ink-muted')
          }
        >
          {enabled ? 'Activée' : 'Désactivée'}
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
            {pending ? 'Initialisation…' : 'Activer la 2FA'}
          </Button>
        </div>
      ) : null}

      {setup ? (
        <form onSubmit={handleConfirm} className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {qrImageSrc ? (
              <img
                src={qrImageSrc}
                alt="QR code à scanner"
                width={200}
                height={200}
                className="rounded-md border border-app-surface-3"
              />
            ) : null}
            <div className="space-y-2 text-sm">
              <p className="text-app-ink-muted">
                Scannez le QR code ou saisissez manuellement cette clé dans votre application :
              </p>
              <code className="block break-all rounded-md bg-app-surface-1 px-2 py-1 font-mono text-xs">
                {setup.secret}
              </code>
              <p className="text-xs text-app-ink-muted">
                Ensuite, entrez le code à 6 chiffres généré pour confirmer.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="totp-code" className="text-xs font-semibold text-app-ink-muted">
              Code à 6 chiffres
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
              {pending ? 'Vérification…' : 'Confirmer et activer'}
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
              Annuler
            </Button>
          </div>
        </form>
      ) : null}

      {recoveryCodes ? (
        <div
          role="status"
          className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">Codes de récupération</p>
          <p className="mt-1 text-xs">
            Sauvegardez ces codes dans un gestionnaire sécurisé — ils ne seront plus
            jamais affichés. Chaque code permet une connexion d&apos;urgence si vous
            perdez l&apos;accès à votre application.
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
            Copier tous les codes
          </button>
        </div>
      ) : null}

      {enabled && !setup ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleRegenerate} disabled={pending}>
            Régénérer les codes de récupération
          </Button>
          {!showDisable ? (
            <Button
              variant="ghost"
              onClick={() => setShowDisable(true)}
              className="text-red-600 hover:text-red-700"
              disabled={pending}
            >
              Désactiver la 2FA
            </Button>
          ) : (
            <form onSubmit={handleDisable} className="flex w-full flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                placeholder="Mot de passe"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <Button type="submit" variant="outline" disabled={pending || !disablePassword}>
                Confirmer la désactivation
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
                Annuler
              </Button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
