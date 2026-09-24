'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { BASCULE_MOT_DE_PASSE, CIBLE_LIEN_EN_LIGNE } from '@/components/auth/cibles';
import { FormInput, FormGlobalError } from '@/components/forms';
import { loginSchema, type LoginFormValues } from '@/lib/schemas';
import { useApiForm } from '@/hooks/useApiForm';
import { login, isTwoFactorChallenge, type LoginResponse } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';
import { useCurrentLocale } from '@/i18n/hooks';
import { useTranslations } from 'next-intl';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { destinationInterne } from '@/lib/redirection-interne';

const OAUTH_ERRORS = ['oauth_invalid', 'oauth_failed', 'oauth_unknown'] as const;

function LoginForm() {
  const t = useTranslations('auth.login');
  const t2fa = useTranslations('auth.twoFactorChallenge');
  const messageErreur = useMessageErreurApi();
  const router = useRouter();
  // TCK-509 — `openSession` et non « poser le cookie puis `setUser` » : ce second chemin
  // laissait au contexte le jeton d'avant (celui du compte précédent, ou aucun).
  const { openSession } = useAuth();
  const locale = useCurrentLocale();
  const searchParams = useSearchParams();
  // Le filtre PARTAGÉ avec le retour OAuth et l'onboarding (TCK-493) : la copie locale laissait
  // passer `/\evil.tld`, que certains navigateurs lisent `//evil.tld`. C'est aussi par ce paramètre
  // que la connexion rend la page quittée — la recherche en cours (TCK-568, `hrefConnexion`).
  const redirectTo = destinationInterne(searchParams.get('redirect'));
  const passwordWasReset = searchParams.get('reset') === '1';
  // Le callback OAuth renvoie ici sur `?error=…` : ce retour n'était LU par personne, et un
  // échec Google ramenait sur un formulaire muet, comme si rien ne s'était passé.
  const oauthError = OAUTH_ERRORS.find((code) => code === searchParams.get('error')) ?? null;
  const [showPassword, setShowPassword] = useState(false);

  // TCK-069 — 2FA challenge. When the first POST returns `requires_2fa`,
  // we keep the credentials in state and render a second form that
  // re-submits with `two_factor_code` or `recovery_code`.
  const [challenge, setChallenge] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengePending, setChallengePending] = useState(false);

  const defaultValues: LoginFormValues = { email: '', password: '' };

  const { form, isSubmitting, globalError, handleSubmit } = useApiForm<
    LoginFormValues,
    LoginResponse
  >({
    schema: loginSchema,
    defaultValues,
    formOptions: { mode: 'onTouched' },
    onSubmit: (values) => login(values, locale),
    onSuccess: async (result, values) => {
      if (isTwoFactorChallenge(result)) {
        setChallenge({ email: values.email, password: values.password });
        return;
      }
      await openSession(result.token, result.user);
      router.push(redirectTo);
    },
  });

  async function handleChallengeSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setChallengePending(true);
    setChallengeError(null);
    try {
      const result = await login(
        {
          email: challenge.email,
          password: challenge.password,
          ...(useRecovery
            ? { recovery_code: twoFactorCode }
            : { two_factor_code: twoFactorCode }),
        },
        locale,
      );
      if (isTwoFactorChallenge(result)) {
        setChallengeError(result.message ?? t2fa('invalidCode'));
        return;
      }
      await openSession(result.token, result.user);
      router.push(redirectTo);
    } catch (err) {
      // Le test structurel `'displayMessage' in err` rendait la CLÉ i18n quand l'erreur en
      // portait une : `messageErreur` traduit le code avec le dictionnaire du client.
      setChallengeError(messageErreur(err, t2fa('invalidCode')));
    } finally {
      setChallengePending(false);
    }
  }

  if (challenge) {
    return (
      <div>
        <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">
          {t2fa('title')}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-8">
          {useRecovery ? t2fa('recoveryIntro') : t2fa('appIntro')}
        </p>

        {challengeError ? (
          <FormGlobalError>{challengeError}</FormGlobalError>
        ) : null}

        <form onSubmit={handleChallengeSubmit} className="space-y-5">
          <div>
            <label
              htmlFor="two-factor-code"
              className="mb-1.5 block text-sm font-medium"
            >
              {useRecovery ? t2fa('recoveryLabel') : t2fa('codeLabel')}
            </label>
            <Input
              id="two-factor-code"
              value={twoFactorCode}
              onChange={(e) =>
                setTwoFactorCode(
                  useRecovery
                    ? e.target.value.toUpperCase().slice(0, 11)
                    : e.target.value.replace(/\D/g, '').slice(0, 6),
                )
              }
              inputMode={useRecovery ? 'text' : 'numeric'}
              pattern={useRecovery ? undefined : '\\d{6}'}
              autoComplete="one-time-code"
              placeholder={useRecovery ? t2fa('recoveryPlaceholder') : t2fa('codePlaceholder')}
              className="h-11 tabular-nums tracking-widest"
              required
            />
          </div>

          <Button
            type="submit"
            disabled={challengePending || twoFactorCode.length < (useRecovery ? 11 : 6)}
            className="w-full rounded-full h-11 text-base font-semibold"
          >
            {challengePending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t2fa('verifying')}
              </>
            ) : (
              t2fa('verify')
            )}
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            className="-ml-2 min-h-11 rounded-lg px-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => {
              setUseRecovery((v) => !v);
              setTwoFactorCode('');
              setChallengeError(null);
            }}
          >
            {useRecovery ? t2fa('useApp') : t2fa('useRecovery')}
          </button>
          <button
            type="button"
            className="-mr-2 min-h-11 rounded-lg px-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => {
              setChallenge(null);
              setTwoFactorCode('');
              setChallengeError(null);
              setUseRecovery(false);
            }}
          >
            {t2fa('cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">
        {t('title')}
      </h1>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-8">{t('subtitle')}</p>

      {passwordWasReset ? (
        <div
          role="status"
          className="mb-6 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {t('resetSuccess')}
        </div>
      ) : null}

      {oauthError ? <FormGlobalError className="mb-6">{t(`oauthError.${oauthError}`)}</FormGlobalError> : null}

      <OAuthButtons separator="after" />

      <FormGlobalError>{globalError}</FormGlobalError>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <FormInput<LoginFormValues>
          name="email"
          control={form.control}
          label={t('email')}
          type="email"
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          className="h-11"
          required
        />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="field-password" className="block text-sm font-medium">
              {t('password')}
              <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
            </label>
            <Link
              href="/auth/forgot-password"
              className={`${CIBLE_LIEN_EN_LIGNE} text-sm font-medium text-primary underline-offset-4 hover:underline`}
            >
              {t('forgotPassword')}
            </Link>
          </div>
          <FormInput<LoginFormValues>
            name="password"
            control={form.control}
            id="field-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            className="h-11 pr-12"
            required
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className={BASCULE_MOT_DE_PASSE}
                aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full h-11 text-base font-semibold"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('submitting')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('noAccount')}{' '}
        <Link
          href="/auth/register"
          className={`${CIBLE_LIEN_EN_LIGNE} font-semibold text-primary underline-offset-4 hover:underline`}
        >
          {t('registerCta')}
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
