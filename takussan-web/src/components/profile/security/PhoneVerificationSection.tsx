'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Phone } from 'lucide-react';
import { StatusBadge } from '@/components/console/StatusBadge';
import { Button } from '@/components/ui/button';
import { RangeeDeSecurite } from './RangeeDeSecurite';
import { Input } from '@/components/ui/input';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { useAuth } from '@/context/AuthContext';
import { formaterTelephone } from '@/lib/phone';
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
  const tCommon = useTranslations('common.actions');
  const { user, setUser } = useAuth();
  // TCK-2040 (P202.03) — l'état se lit dans la propriété, que `ProfileSecuritySection` tire du
  // contexte : un numéro changé dans « Coordonnées » repasse ici à « non vérifié ». La copie
  // locale ne retient que le numéro vérifié par cette section, et ne vaut que pour lui.
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const verified = initialVerified || (phone !== null && verifiedPhone === phone);
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [apercu, setApercu] = useState<string | null>(null);
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
      setApercu(result.data?.codeApercu ?? null);
      // TCK-589 — le code part par SMS ; l'API ne le rend qu'hors production (TCK-620, ADR-0060).
      setFeedback(tOtp('otpSent'));
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
      setVerifiedPhone(phone);
      // Comme « Coordonnées » : le reste de l'application (second numéro, badge des
      // coordonnées, publication) lit la vérification dans le contexte.
      if (user) setUser({ ...user, phone_verified_at: new Date().toISOString() });
      setCode('');
      setFeedback(tOtp('phoneVerifiedOk'));
    });
  }

  // TCK-2635 — une rangée de la carte « Sécurité » (maquette `RangeeSecurite`) : « Vérifier » à droite,
  // le code à saisir déplié dessous.
  return (
    <RangeeDeSecurite
      icone={Phone}
      titre={t('titreCourt')}
      statut={
        phone ? (
          <StatusBadge
            data-testid="security-phone-status"
            tone={verified ? 'success' : 'attention'}
            label={verified ? tOtp('verified') : tOtp('notVerified')}
          />
        ) : undefined
      }
      detail={phone ? (verified ? formaterTelephone(phone) : t('detail', { phone: formaterTelephone(phone) })) : t('descriptionNoPhone')}
      action={
        !verified && phone ? (
          <Button size="sm" variant="outline" onClick={handleSend} disabled={pending}>
            {pending && !sent ? tOtp('sending') : sent ? tOtp('resendCode') : tOtp('verify')}
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p role="status" className="text-sm text-success">
          {feedback}
        </p>
      ) : null}
      {!verified && phone && sent ? (
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
            {pending ? tOtp('verifying') : tCommon('confirm')}
          </Button>
        </form>
      ) : null}
      {!verified && phone && sent ? <CodeDePreproduction code={apercu} onUtiliser={setCode} /> : null}
    </RangeeDeSecurite>
  );
}
