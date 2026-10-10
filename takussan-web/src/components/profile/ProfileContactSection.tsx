'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import type { User } from '@/types/user';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { Button } from '@/components/ui/button';
import { updateProfileAction } from '@/app/actions/auth';
import {
  phoneChangeCodeAction,
  phoneSendOtpAction,
  phoneVerifyOtpAction,
} from '@/app/actions/security';
import { isE164, normalizePhoneInput } from '@/lib/phone';
import { useAuth } from '@/context/AuthContext';

interface ProfileContactSectionProps {
  user: User;
}

type Feedback = { ok: boolean; message: string };

/**
 * TCK-137 — Phone is now editable from the contact tab. The verification
 * flow is the same one used on the security tab (TCK-069); the actions
 * `phoneSendOtpAction` / `phoneVerifyOtpAction` are reused inline so the
 * user can verify without leaving this section.
 *
 * Status reset: the backend wipes `phone_verified_at` when the value
 * changes (`AuthController::updateProfile`). The local `phoneVerified`
 * state mirrors this so the badge flips immediately on save.
 *
 * TCK-589 p3-1 — remplacer un numéro VÉRIFIÉ exige une preuve sur le facteur en place
 * (`PhoneChangeGuard`, 403 `phone.change_requires_proof` sans elle) : le mot de passe actuel
 * quand le compte en a un, ou un code reçu sur l'ANCIEN numéro. Le bloc de preuve n'apparaît
 * que dans ce cas ; un premier numéro, ou un numéro non vérifié, se change librement.
 */
export function ProfileContactSection({ user }: ProfileContactSectionProps) {
  const t = useTranslations('profile.contact');
  const tCommon = useTranslations('common.actions');
  const { setUser, user: contextUser } = useAuth();
  const [bio, setBio] = useState(user.bio ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [savedPhone, setSavedPhone] = useState(user.phone ?? '');
  const [phoneVerified, setPhoneVerified] = useState(
    Boolean(user.phone_verified_at),
  );
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // OTP inline flow
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpApercu, setOtpApercu] = useState<string | null>(null);
  const [otpFeedback, setOtpFeedback] = useState<Feedback | null>(null);
  const [otpPending, startOtpTransition] = useTransition();

  // Preuve du remplacement d'un numéro vérifié (TCK-589 p3-1)
  const [proofPassword, setProofPassword] = useState('');
  const [proofCode, setProofCode] = useState('');
  const [proofCodeSent, setProofCodeSent] = useState(false);
  const [proofApercu, setProofApercu] = useState<string | null>(null);
  const [proofFeedback, setProofFeedback] = useState<Feedback | null>(null);
  const [proofPending, startProofTransition] = useTransition();

  const emailVerified = Boolean(user.email_verified_at);
  const phoneTrimmed = phone.trim();
  const phoneFormatValid = phoneTrimmed.length === 0 || isE164(phoneTrimmed);
  const phoneDirty = phoneTrimmed !== savedPhone;
  const bioDirty = bio !== (user.bio ?? '');
  const canProveByPassword = user.has_usable_password === true;
  const needsProof = phoneDirty && phoneVerified && savedPhone.length > 0;
  const proofGiven = proofPassword.length > 0 || proofCode.length === 6;
  const canSubmit =
    phoneFormatValid && (phoneDirty || bioDirty) && !loading && (!needsProof || proofGiven);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phoneFormatValid) return;
    setLoading(true);
    setFeedback(null);
    const fd = new FormData();
    // TCK-623 — les noms ne partent pas d'ici : cette section ne les montre pas, et un compte
    // ouvert par téléphone n'en a pas encore. Les renvoyer vides faisait refuser toute la
    // sauvegarde (422), bio et numéro compris.
    fd.append('bio', bio);
    fd.append('phone', phoneTrimmed);
    if (needsProof) {
      if (proofPassword.length > 0) fd.append('current_password', proofPassword);
      else fd.append('phone_change_code', proofCode);
    }
    const result = await updateProfileAction(fd);
    setLoading(false);
    if (!result.ok) {
      setFeedback({ ok: false, message: result.message ?? t('saveError') });
      return;
    }
    setSavedPhone(result.user.phone ?? '');
    setPhone(result.user.phone ?? '');
    setPhoneVerified(Boolean(result.user.phone_verified_at));
    setOtpSent(false);
    setOtpCode('');
    setOtpFeedback(null);
    setProofPassword('');
    setProofCode('');
    setProofCodeSent(false);
    setProofFeedback(null);
    // Keep the global auth context in sync so other sections that read
    // from `useAuth()` (notably `ProfileSecuritySection`) reflect the
    // new phone + reset verification status without a page reload.
    setUser({ ...(contextUser ?? user), ...result.user });
    setFeedback({ ok: true, message: t('saved') });
  }

  function handleSendProofCode() {
    setProofFeedback(null);
    startProofTransition(async () => {
      const result = await phoneChangeCodeAction();
      if (!result.ok) {
        setProofFeedback({ ok: false, message: result.message });
        return;
      }
      setProofCodeSent(true);
      setProofApercu(result.data?.codeApercu ?? null);
      setProofFeedback({ ok: true, message: t('changeProofCodeSent') });
    });
  }

  function handleSendOtp() {
    setOtpFeedback(null);
    startOtpTransition(async () => {
      const result = await phoneSendOtpAction();
      if (!result.ok) {
        setOtpFeedback({ ok: false, message: result.message });
        return;
      }
      setOtpSent(true);
      setOtpApercu(result.data?.codeApercu ?? null);
      setOtpFeedback({
        ok: true,
        // TCK-589 — le code part par SMS ; l'API ne le rend qu'hors production (TCK-620, ADR-0060).
        message: t('otpSent'),
      });
    });
  }

  function handleVerifyOtp() {
    setOtpFeedback(null);
    startOtpTransition(async () => {
      const result = await phoneVerifyOtpAction(otpCode);
      if (!result.ok) {
        setOtpFeedback({ ok: false, message: result.message });
        return;
      }
      setPhoneVerified(true);
      setOtpSent(false);
      setOtpCode('');
      setOtpFeedback({ ok: true, message: t('phoneVerifiedOk') });
      // Mirror the verified status to the auth context so the security
      // section and any other consumer pick it up immediately.
      const base = contextUser ?? user;
      setUser({ ...base, phone_verified_at: new Date().toISOString() });
    });
  }

  const showVerifyControls = savedPhone.length > 0 && !phoneVerified && !phoneDirty;

  return (
    <section className="space-y-4 rounded-2xl bg-card p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">{t('emailLabel')}</label>
          <div className="flex items-center gap-2">
            <Input value={user.email} disabled className="bg-card/60" />
            <span
              className={
                'rounded-full px-2 py-1 text-xs font-semibold ' +
                (emailVerified
                  ? 'bg-border text-foreground'
                  : 'bg-card text-primary')
              }
            >
              {emailVerified ? t('verified') : t('notVerified')}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <label htmlFor="phone" className="text-xs font-semibold text-muted-foreground">
            {t('phoneLabel')}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="phone"
              data-testid="phone-input"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(normalizePhoneInput(e.target.value))}
              placeholder="+221770000000"
              aria-invalid={!phoneFormatValid}
              aria-describedby={!phoneFormatValid ? 'phone-error' : undefined}
            />
            {savedPhone.length > 0 && !phoneDirty ? (
              <span
                data-testid="phone-status-badge"
                className={
                  'whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ' +
                  (phoneVerified
                    ? 'bg-success/15 text-success'
                    : 'bg-warning/15 text-warning')
                }
              >
                {phoneVerified ? t('verified') : t('notVerified')}
              </span>
            ) : null}
          </div>
          {!phoneFormatValid ? (
            <p id="phone-error" role="alert" className="text-xs text-destructive">
              {t('phoneFormatError')}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('phoneHint')}
            </p>
          )}
        </div>

        {needsProof ? (
          <div
            data-testid="phone-change-proof"
            className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
          >
            <p className="text-xs text-foreground">{t('changeProofPrompt')}</p>
            {canProveByPassword ? (
              <>
                <label
                  htmlFor="phone-change-password"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  {t('changeProofPasswordLabel')}
                </label>
                <Input
                  id="phone-change-password"
                  data-testid="phone-change-password"
                  type="password"
                  autoComplete="current-password"
                  value={proofPassword}
                  onChange={(e) => setProofPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t('changeProofOr')}</p>
              </>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSendProofCode}
                disabled={proofPending}
                data-testid="phone-change-send-code"
              >
                {proofPending ? t('sending') : t('changeProofSendCode', { phone: savedPhone })}
              </Button>
              {proofCodeSent ? (
                <Input
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={proofCode}
                  onChange={(e) => setProofCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  aria-label={t('changeProofCodeAria')}
                  data-testid="phone-change-code"
                  className="max-w-[8rem]"
                />
              ) : null}
            </div>
            <CodeDePreproduction code={proofCodeSent ? proofApercu : null} onUtiliser={setProofCode} />
            {proofFeedback ? (
              <p
                role={proofFeedback.ok ? 'status' : 'alert'}
                className={'text-xs ' + (proofFeedback.ok ? 'text-success' : 'text-destructive')}
              >
                {proofFeedback.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {showVerifyControls ? (
          <div
            data-testid="phone-verify-block"
            className="space-y-2 rounded-md border border-warning/30 bg-warning/10 p-3"
          >
            <p className="text-xs text-warning">
              {t('verifyPrompt')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSendOtp}
                disabled={otpPending}
                data-testid="phone-otp-send"
              >
                {otpPending && !otpSent
                  ? t('sending')
                  : otpSent
                    ? t('resendCode')
                    : t('verify')}
              </Button>
              {otpSent ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (otpCode.length === 6 && !otpPending) handleVerifyOtp();
                      }
                    }}
                    placeholder="123456"
                    autoComplete="one-time-code"
                    aria-label={t('otpCodeAria')}
                    data-testid="phone-otp-code"
                    className="max-w-[8rem]"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleVerifyOtp}
                    disabled={otpPending || otpCode.length !== 6}
                    data-testid="phone-otp-verify"
                  >
                    {otpPending ? t('verifying') : tCommon('confirm')}
                  </Button>
                </div>
              ) : null}
            </div>
            <CodeDePreproduction code={otpSent ? otpApercu : null} onUtiliser={setOtpCode} />
            {otpFeedback ? (
              <p
                role={otpFeedback.ok ? 'status' : 'alert'}
                className={'text-xs ' + (otpFeedback.ok ? 'text-success' : 'text-destructive')}
              >
                {otpFeedback.message}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1">
          <label htmlFor="contact-bio" className="text-xs font-semibold text-muted-foreground">
            {t('bioLabel')}
          </label>
          <Textarea
            id="contact-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t('bioPlaceholder')}
          />
          <p className="text-right text-xs text-muted-foreground">{bio.length}/500</p>
        </div>
        {feedback ? (
          <p
            role={feedback.ok ? 'status' : 'alert'}
            className={'text-sm ' + (feedback.ok ? 'text-success' : 'text-destructive')}
          >
            {feedback.message}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={!canSubmit} data-testid="contact-save">
            {loading ? t('saving') : tCommon('save')}
          </Button>
        </div>
      </form>
    </section>
  );
}
