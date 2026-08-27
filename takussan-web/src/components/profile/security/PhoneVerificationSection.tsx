'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('profile.security.phone');
  // Le tunnel OTP est le MÊME que celui de la section « Coordonnées » (mêmes
  // server actions) : ses libellés vivent sous `profile.contact.*`, et les
  // rejouer ici créerait des clés jumelles.
  const tOtp = useTranslations('profile.contact');
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
          ? tOtp('otpSentDebug', { code: result.data.debug_code })
          : tOtp('otpSent'),
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
      setFeedback(tOtp('phoneVerifiedOk'));
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">
            {t('title')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {phone ? t('descriptionWithPhone', { phone }) : t('descriptionNoPhone')}
          </p>
        </div>
        <span
          className={
            'rounded-full px-2 py-1 text-xs font-semibold ' +
            (verified
              ? 'bg-success/15 text-success'
              : 'bg-card text-muted-foreground')
          }
        >
          {verified ? tOtp('verified') : tOtp('notVerified')}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p role="status" className="mt-3 text-sm text-success">
          {feedback}
        </p>
      ) : null}

      {!verified && phone ? (
        <div className="mt-4 space-y-3">
          <div>
            <Button onClick={handleSend} disabled={pending} variant="outline">
              {pending && !sent ? tOtp('sending') : sent ? tOtp('resendCode') : t('sendCode')}
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
                aria-label={tOtp('otpCodeAria')}
                required
              />
              <Button type="submit" disabled={pending || code.length !== 6}>
                {pending ? tOtp('verifying') : tOtp('verify')}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
