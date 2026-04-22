'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { OAuthButtons, OAuthSeparator } from '@/components/auth/OAuthButtons';
import { FormInput, FormGlobalError } from '@/components/forms';
import { loginSchema, type LoginFormValues } from '@/lib/schemas';
import { useApiForm } from '@/hooks/useApiForm';
import { login } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';

function LoginForm() {
  const router = useRouter();
  const { setUser } = useAuth();
  const searchParams = useSearchParams();
  const raw = searchParams.get('redirect') ?? '/app';
  const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/app';
  const [showPassword, setShowPassword] = useState(false);

  const defaultValues: LoginFormValues = { email: '', password: '' };

  const { form, isSubmitting, globalError, handleSubmit } = useApiForm<LoginFormValues, { token: string; user: Awaited<ReturnType<typeof login>>['user'] }>({
    schema: loginSchema,
    defaultValues,
    formOptions: { mode: 'onTouched' },
    onSubmit: (values) => login(values),
    onSuccess: async ({ token, user }) => {
      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setUser(user);
      router.push(redirectTo);
    },
  });

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
