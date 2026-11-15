'use client';

import { useId, useState, useTransition } from 'react';
import { Check, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { User } from '@/types/user';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CodeDePreproduction } from '@/components/auth/CodeDePreproduction';
import { Button } from '@/components/ui/button';
import { PhoneInput } from '@/components/ui/phone-input';
import { StatusBadge } from '@/components/console/StatusBadge';
import { PiedDEnregistrement } from '@/components/profile/sommaire/PiedDEnregistrement';
import { resendVerificationEmailAction, updateProfileAction } from '@/app/actions/auth';
import {
  phoneChangeCodeAction,
  phoneSendOtpAction,
  phoneVerifyOtpAction,
} from '@/app/actions/security';
import { isE164, normalizePhoneInput } from '@/lib/phone';
import { useAuth } from '@/context/AuthContext';
import { CaseWhatsApp } from '@/components/profile/security/CaseWhatsApp';
import { SecondaryPhoneSection } from '@/components/profile/security/SecondaryPhoneSection';

interface ProfileContactSectionProps {
  user: User;
}

type Feedback = { ok: boolean; message: string };

/** Le contrôle de forme du navigateur, sans plus : c'est l'API qui juge (`email`, unicité). */
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 *
 * TCK-632 — l'adresse e-mail suit la même règle, sans voie de preuve : un compte ouvert par
 * téléphone l'AJOUTE ici, et une adresse jamais vérifiée se corrige ; une adresse vérifiée reste en
 * lecture seule (l'API refuserait son remplacement, 403). L'enregistrement envoie le lien, et
 * « Renvoyer le lien » le renvoie tant qu'il n'a pas été suivi.
 */
export function ProfileContactSection({ user }: ProfileContactSectionProps) {
  const t = useTranslations('profile.contact');
  const tCommon = useTranslations('common.actions');
  const { setUser, user: contextUser } = useAuth();
  const idFormulaire = useId();
  const [bio, setBio] = useState(user.bio ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [savedPhone, setSavedPhone] = useState(user.phone ?? '');
  const [phoneVerifiedHere, setPhoneVerified] = useState(
    Boolean(user.phone_verified_at),
  );
  // TCK-2040 (P202.03) — le même numéro se vérifie aussi dans « Sécurité », qui le pose au
  // contexte : le badge le suit tant que le contexte parle du numéro enregistré ici.
  const phoneVerified =
    phoneVerifiedHere ||
    (savedPhone.length > 0 &&
      contextUser?.phone === savedPhone &&
      Boolean(contextUser?.phone_verified_at));
  const [email, setEmail] = useState(user.email ?? '');
  const [savedEmail, setSavedEmail] = useState(user.email ?? '');
  const [emailVerified, setEmailVerified] = useState(Boolean(user.email_verified_at));
  const [emailFeedback, setEmailFeedback] = useState<Feedback | null>(null);
  const [emailPending, startEmailTransition] = useTransition();
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

  // L'API range l'adresse en minuscules : la comparer telle quelle ferait d'une simple variante
  // de casse une modification, et renverrait un lien à chaque enregistrement.
  const emailTrimmed = email.trim();
  const emailDirty = emailTrimmed.toLowerCase() !== savedEmail.toLowerCase();
  // Vider le champ n'est pas un geste de cette section : une adresse enregistrée ne se retire pas.
  const emailFormatValid = emailTrimmed.length === 0 ? savedEmail.length === 0 : ADRESSE.test(emailTrimmed);
  const phoneTrimmed = phone.trim();
  const phoneFormatValid = phoneTrimmed.length === 0 || isE164(phoneTrimmed);
  const phoneDirty = phoneTrimmed !== savedPhone;
  const bioDirty = bio !== (user.bio ?? '');
  const canProveByPassword = user.has_usable_password === true;
  const needsProof = phoneDirty && phoneVerified && savedPhone.length > 0;
  const proofGiven = proofPassword.length > 0 || proofCode.length === 6;
  const canSubmit =
    phoneFormatValid &&
    emailFormatValid &&
    (phoneDirty || bioDirty || emailDirty) &&
    !loading &&
    (!needsProof || proofGiven);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!phoneFormatValid || !emailFormatValid) return;
    setLoading(true);
    setFeedback(null);
    const fd = new FormData();
    // TCK-623 — les noms ne partent pas d'ici : cette section ne les montre pas, et un compte
    // ouvert par téléphone n'en a pas encore. Les renvoyer vides faisait refuser toute la
    // sauvegarde (422), bio et numéro compris.
    fd.append('bio', bio);
    fd.append('phone', phoneTrimmed);
    if (emailDirty) fd.append('email', emailTrimmed);
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
    setSavedEmail(result.user.email ?? '');
    setEmail(result.user.email ?? '');
    setEmailVerified(Boolean(result.user.email_verified_at));
    setEmailFeedback(null);
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
    setFeedback({
      ok: true,
      message: emailDirty ? t('emailLinkSent', { email: result.user.email ?? emailTrimmed }) : t('saved'),
    });
  }

  function handleResendEmail() {
    setEmailFeedback(null);
    startEmailTransition(async () => {
      const result = await resendVerificationEmailAction();
      setEmailFeedback(
        result.ok
          ? { ok: true, message: t('emailLinkSent', { email: savedEmail }) }
          : { ok: false, message: result.message ?? t('saveError') },
      );
    });
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
  const showEmailVerify = savedEmail.length > 0 && !emailVerified && !emailDirty;

  const modifications = Number(phoneDirty) + Number(emailDirty) + Number(bioDirty);

  // TCK-2635 — la section suit la maquette `app-profil` « Coordonnées » (`SectionCoordonnees`) : à nu
  // sous le titre de la page (le titre et l'aide sont ceux de la section), trois champs dans l'ordre
  // Téléphone · Courriel · Présentation, chacun avec son libellé, son statut à droite, son aide dessous.
  return (
    <section id="coordonnees" aria-label={t('title')} className="scroll-mt-20">
      <form id={idFormulaire} onSubmit={handleSubmit} className="grid gap-5">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <label htmlFor="phone" className="flex-1 text-sm font-medium">
              {t('phoneLabel')}
            </label>
            {savedPhone.length > 0 && !phoneDirty ? (
              <StatusBadge
                data-testid="phone-status-badge"
                tone={phoneVerified ? 'success' : 'attention'}
                icon={phoneVerified ? <Check aria-hidden="true" /> : undefined}
                label={phoneVerified ? t('verified') : t('notVerified')}
              />
            ) : null}
          </div>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <PhoneInput
                id="phone"
                data-testid="phone-input"
                value={phone}
                onValueChange={(valeur) => setPhone(normalizePhoneInput(valeur))}
                aide={false}
                aria-invalid={!phoneFormatValid}
                aria-describedby={!phoneFormatValid ? 'phone-error' : 'phone-hint'}
              />
            </div>
            {showVerifyControls ? (
              <Button
                type="button"
                variant="outline"
                className="h-controle"
                onClick={handleSendOtp}
                disabled={otpPending}
                data-testid="phone-otp-send"
              >
                {otpPending && !otpSent ? t('sending') : otpSent ? t('resendCode') : t('verify')}
              </Button>
            ) : null}
          </div>
          {!phoneFormatValid ? (
            <p id="phone-error" role="alert" className="mt-1.5 text-xs text-destructive">
              {t('phoneFormatError')}
            </p>
          ) : (
            <p id="phone-hint" className="mt-1.5 text-xs text-muted-foreground">
              {t('phoneAide')}
            </p>
          )}
          {/* TCK-633 (lot C) — la case WhatsApp vaut pour le numéro ENREGISTRÉ et vérifié. */}
          {phoneVerified && !phoneDirty && savedPhone.length > 0 ? (
            <div className="mt-2">
              <CaseWhatsApp champ="phone_whatsapp" id="phone-whatsapp" />
            </div>
          ) : null}

          {showVerifyControls ? (
            <div data-testid="phone-verify-block" className="mt-2 grid gap-2 empty:hidden">
              {otpSent ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
                    className="max-w-32"
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

          {needsProof ? (
            <div data-testid="phone-change-proof" className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-xs text-foreground">{t('changeProofPrompt')}</p>
              {canProveByPassword ? (
                <>
                  <label htmlFor="phone-change-password" className="text-xs font-semibold text-muted-foreground">
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
                    className="max-w-32"
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
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <label htmlFor="contact-email" className="flex-1 text-sm font-medium">
              {t('emailLabel')}
            </label>
            {savedEmail.length > 0 && !emailDirty ? (
              <StatusBadge
                data-testid="email-status-badge"
                tone={emailVerified ? 'success' : 'attention'}
                icon={emailVerified ? <Check aria-hidden="true" /> : undefined}
                label={emailVerified ? t('verified') : t('notVerified')}
              />
            ) : null}
          </div>
          {/* Vérifiée, l'adresse est l'identifiant de connexion : en lecture seule, verrouillée. */}
          <div className="relative">
            <Input
              id="contact-email"
              data-testid="email-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={emailVerified}
              placeholder={t('emailPlaceholder')}
              aria-invalid={!emailFormatValid}
              aria-describedby={!emailFormatValid ? 'email-error' : 'email-hint'}
              className={emailVerified ? 'bg-muted/50 pr-9 text-encre-douce' : undefined}
            />
            {emailVerified ? (
              <Lock
                className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            ) : null}
          </div>
          {!emailFormatValid ? (
            <p id="email-error" role="alert" className="mt-1.5 text-xs text-destructive">
              {t('emailFormatError')}
            </p>
          ) : (
            <p id="email-hint" className="mt-1.5 text-xs text-muted-foreground">
              {emailVerified ? t('emailIdentifiant') : savedEmail.length > 0 ? t('emailUnverifiedHint') : t('emailAddHint')}
            </p>
          )}
          {showEmailVerify ? (
            <div data-testid="email-verify-block" className="mt-2 space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-3">
              <p className="text-xs text-warning">{t('emailVerifyPrompt', { email: savedEmail })}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResendEmail}
                disabled={emailPending}
                data-testid="email-resend"
              >
                {emailPending ? t('sending') : t('emailResend')}
              </Button>
              {emailFeedback ? (
                <p
                  role={emailFeedback.ok ? 'status' : 'alert'}
                  className={'text-xs ' + (emailFeedback.ok ? 'text-success' : 'text-destructive')}
                >
                  {emailFeedback.message}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <label htmlFor="contact-bio" className="flex-1 text-sm font-medium">
              {t('bioLabel')}
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">{t('bioCompte', { n: bio.length })}</span>
          </div>
          <Textarea
            id="contact-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder={t('bioPlaceholder')}
            aria-describedby="contact-bio-aide"
            className="min-h-28"
          />
          <p id="contact-bio-aide" className="mt-1.5 text-xs text-muted-foreground">
            {t('bioAide')}
          </p>
        </div>

        <SecondaryPhoneSection />

        {/* TCK-2635 — un seul « Enregistrer », actif sur une modification. */}
        <PiedDEnregistrement
          modifications={modifications}
          bouton={
            <Button type="submit" form={idFormulaire} disabled={!canSubmit} data-testid="contact-save">
              {loading ? t('saving') : tCommon('save')}
            </Button>
          }
        >
          {/* « Enregistré » se tait dès la modification suivante : « 1 modification non enregistrée ·
              Modifications enregistrées. » se contredirait. */}
          {feedback && !(feedback.ok && modifications > 0) ? (
            <p role={feedback.ok ? 'status' : 'alert'} className={'text-sm ' + (feedback.ok ? 'text-success' : 'text-destructive')}>
              {feedback.message}
            </p>
          ) : null}
        </PiedDEnregistrement>
      </form>
    </section>
  );
}
