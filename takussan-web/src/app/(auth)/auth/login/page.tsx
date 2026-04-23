'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { OAuthButtons, OAuthSeparator } from '@/components/auth/OAuthButtons';
import { FormInput, FormGlobalError } from '@/components/forms';
import { loginSchema, type LoginFormValues } from '@/lib/schemas';
import { useApiForm } from '@/hooks/useApiForm';
import { login, isTwoFactorChallenge, type LoginResponse } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';

function LoginForm() {
  const router = useRouter();
  const { setUser } = useAuth();
  const searchParams = useSearchParams();
  const raw = searchParams.get('redirect') ?? '/app';
  const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/app';
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
    onSubmit: (values) => login(values),
    onSuccess: async (result, values) => {
      if (isTwoFactorChallenge(result)) {
        setChallenge({ email: values.email, password: values.password });
        return;
      }
      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
      });
      setUser(result.user);
      router.push(redirectTo);
    },
  });

  async function handleChallengeSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge) return;
    setChallengePending(true);
    setChallengeError(null);
    try {
      const result = await login({
        email: challenge.email,
        password: challenge.password,
        ...(useRecovery
          ? { recovery_code: twoFactorCode }
          : { two_factor_code: twoFactorCode }),
      });
      if (isTwoFactorChallenge(result)) {
        setChallengeError(result.message ?? 'Code invalide.');
        return;
      }
      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: result.token }),
      });
      setUser(result.user);
      router.push(redirectTo);
    } catch (err) {
      setChallengeError(
        err instanceof Error && 'displayMessage' in err
          ? (err as { displayMessage: string }).displayMessage
          : 'Code invalide.',
      );
    } finally {
      setChallengePending(false);
    }
  }

  if (challenge) {
    return (
      <div>
        <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight mb-2">
          Authentification à deux facteurs
        </h1>
        <p className="text-muted-foreground text-sm mb-8">
          {useRecovery
            ? 'Entrez un de vos codes de récupération à usage unique.'
            : 'Entrez le code à 6 chiffres généré par votre application d’authentification.'}
        </p>

        {challengeError ? (
          <FormGlobalError>{challengeError}</FormGlobalError>
        ) : null}

        <form onSubmit={handleChallengeSubmit} className="space-y-5">
          <div className="space-y-1">
            <label
              htmlFor="two-factor-code"
              className="block text-sm font-medium"
            >
              {useRecovery ? 'Code de récupération' : 'Code à 6 chiffres'}
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
              placeholder={useRecovery ? 'XXXXX-XXXXX' : '123456'}
              className="h-11"
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
                Vérification…
              </>
            ) : (
              'Vérifier'
            )}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              setUseRecovery((v) => !v);
              setTwoFactorCode('');
              setChallengeError(null);
            }}
          >
            {useRecovery ? 'Utiliser mon application' : 'Utiliser un code de récupération'}
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              setChallenge(null);
              setTwoFactorCode('');
              setChallengeError(null);
              setUseRecovery(false);
            }}
          >
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight mb-2">
        Content de vous revoir
      </h1>
      <p className="text-muted-foreground text-sm mb-8">
        Connectez-vous pour accéder à votre espace Takussan.
      </p>

      <OAuthButtons />
      <OAuthSeparator />

      <FormGlobalError>{globalError}</FormGlobalError>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <FormInput<LoginFormValues>
          name="email"
          control={form.control}
          label="Adresse email"
          type="email"
          autoComplete="email"
          placeholder="vous@exemple.com"
          className="h-11"
          required
        />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="field-password" className="block text-sm font-medium">
              Mot de passe
              <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-primary hover:underline font-medium"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <FormInput<LoginFormValues>
            name="password"
            control={form.control}
            id="field-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className="h-11 pr-10"
            required
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="pr-1 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
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
              Connexion…
            </>
          ) : (
            'Se connecter'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Pas encore de compte ?{' '}
        <Link href="/auth/register" className="text-primary font-semibold hover:underline">
          S&apos;inscrire
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
