'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { OAuthButtons, OAuthSeparator } from '@/components/auth/OAuthButtons';
import {
  FormInput,
  FormCheckbox,
  FormGlobalError,
} from '@/components/forms';
import { registerSchema, type RegisterFormValues } from '@/lib/schemas';
import { useApiForm } from '@/hooks/useApiForm';
import { register } from '@/lib/auth';
import { useTranslations } from 'next-intl';

export default function RegisterPage() {
  const t = useTranslations('auth.register');
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);

  const defaultValues: RegisterFormValues = {
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirmation: '',
    accept_cgu: false,
  };

  const { form, isSubmitting, globalError, handleSubmit } = useApiForm<RegisterFormValues, Awaited<ReturnType<typeof register>>>({
    schema: registerSchema,
    defaultValues,
    formOptions: { mode: 'onTouched' },
    onSubmit: async (values) => {
      // `accept_cgu` is UI-only — the backend doesn't expect it.
      const { accept_cgu, ...payload } = values;
      void accept_cgu;
      return register(payload);
    },
    onSuccess: async ({ token }) => {
      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      router.push('/auth/verify-email');
    },
  });

  return (
    <div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight mb-2">
        {t('title')}
      </h1>
      <p className="text-muted-foreground text-sm mb-8">{t('subtitle')}</p>

      <FormGlobalError>{globalError}</FormGlobalError>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput<RegisterFormValues>
            name="first_name"
            control={form.control}
            label={t('firstName')}
            autoComplete="given-name"
            className="h-11"
            required
          />
          <FormInput<RegisterFormValues>
            name="last_name"
            control={form.control}
            label={t('lastName')}
            autoComplete="family-name"
            className="h-11"
            required
          />
        </div>

        <FormInput<RegisterFormValues>
          name="email"
          control={form.control}
          label={t('email')}
          type="email"
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          className="h-11"
          required
        />

        <FormInput<RegisterFormValues>
          name="password"
          control={form.control}
          label={t('password')}
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder={t('passwordPlaceholder')}
          className="h-11 pr-10"
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="pr-1 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />

        <FormInput<RegisterFormValues>
          name="password_confirmation"
          control={form.control}
          label={t('passwordConfirmation')}
          type={showPasswordConfirmation ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder={t('passwordConfirmationPlaceholder')}
          className="h-11 pr-10"
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowPasswordConfirmation((v) => !v)}
              className="pr-1 text-muted-foreground hover:text-foreground"
              aria-label={
                showPasswordConfirmation ? t('hideConfirmation') : t('showConfirmation')
              }
            >
              {showPasswordConfirmation ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />

        <FormCheckbox<RegisterFormValues>
          name="accept_cgu"
          control={form.control}
          required
          label={t.rich('acceptTerms', {
            terms: (chunks) => (
              <Link href="/terms" className="text-primary hover:underline">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/privacy" className="text-primary hover:underline">
                {chunks}
              </Link>
            ),
          })}
        />

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

      <OAuthSeparator label={t('oauthSeparator')} />
      <OAuthButtons />

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t('hasAccount')}{' '}
        <Link href="/auth/login" className="text-primary font-semibold hover:underline">
          {t('loginCta')}
        </Link>
      </p>
    </div>
  );
}
