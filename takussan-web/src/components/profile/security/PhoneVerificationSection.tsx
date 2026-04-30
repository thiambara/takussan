'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  phoneSendOtpAction,
  phoneVerifyOtpAction,
} from '@/app/actions/security';

interface PhoneVerificationSectionProps {
  phone: string | null;
  phoneVerified: boolean;
}

/**
 * TCK-069 — Phone OTP verification.
 *
 * When phone is verified → just shows the status. Otherwise exposes a
 * "Envoyer le code" + OTP entry form. Rate-limit (429) bubbles up through
 * the `displayMessage` of the server action response.
 */
export function PhoneVerificationSection({
  phone,
  phoneVerified: initialVerified,
}: PhoneVerificationSectionProps) {
  const [verified, setVerified] = useState(initialVerified);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSend() {
    setError(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await phoneSendOtpAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSent(true);
      setFeedback(
        result.data.debug_code
          ? `Code envoyé. (Debug : ${result.data.debug_code})`
          : "Code envoyé. Vérifiez votre SMS (peut prendre jusqu'à 60s).",
      );
    });
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    startTransition(async () => {
      const result = await phoneVerifyOtpAction(code);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setVerified(true);
      setCode('');
      setFeedback('Téléphone vérifié avec succès.');
    });
  }

  return (
    <div className="rounded-2xl border border-app-surface-3 bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-app-ink">
            Vérification du téléphone
          </h3>
          <p className="mt-1 text-sm text-app-ink-muted">
            {phone
              ? `Code SMS à usage unique envoyé au ${phone}.`
              : "Ajoutez d'abord un numéro de téléphone dans la section « Coordonnées »."}
          </p>
        </div>
        <span
          className={
            'rounded-full px-2 py-1 text-xs font-semibold ' +
            (verified
              ? 'bg-emerald-100 text-emerald-800'
              : 'bg-app-surface-1 text-app-ink-muted')
          }
        >
          {verified ? 'Vérifié' : 'Non vérifié'}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p role="status" className="mt-3 text-sm text-emerald-700">
          {feedback}
        </p>
      ) : null}

      {!verified && phone ? (
        <div className="mt-4 space-y-3">
          <div>
            <Button onClick={handleSend} disabled={pending} variant="outline">
              {pending && !sent ? 'Envoi…' : sent ? 'Renvoyer le code' : 'Envoyer le code'}
            </Button>
          </div>

          {sent ? (
            <form onSubmit={handleVerify} className="flex flex-col gap-2 sm:flex-row">
              <Input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoComplete="one-time-code"
                aria-label="Code à 6 chiffres"
                required
              />
              <Button type="submit" disabled={pending || code.length !== 6}>
                {pending ? 'Vérification…' : 'Vérifier'}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
