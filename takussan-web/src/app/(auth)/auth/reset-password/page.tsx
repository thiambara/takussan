'use client';

import { ApiError } from '@/lib/api';
import { resetPassword } from '@/lib/auth';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormError, FormGlobalError } from '@/components/forms';
import { BASCULE_MOT_DE_PASSE, CIBLE_LIEN_EN_LIGNE } from '@/components/auth/cibles';
import { useTranslations } from 'next-intl';

function ResetPasswordForm() {
  const t = useTranslations('auth.resetPassword');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const email = searchParams.get('email') ?? '';

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError('');
    setLoading(true);

    try {
      await resetPassword({
        token,
        email,
        password,
        password_confirmation: passwordConfirmation,
      });
      router.push('/auth/login?reset=1');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422 && err.data && typeof err.data === 'object' && 'errors' in err.data) {
          setErrors((err.data as { errors: Record<string, string[]> }).errors);
        } else {
          setGlobalError((err.data as { message?: string })?.message ?? t('failed'));
        }
      } else {
        setGlobalError(t('networkFailed'));
      }
    } finally {
      setLoading(false);
    }
  }

  if (!token || !email) {
    return (
      <div>
        <div className="flex items-center justify-center size-14 rounded-full bg-destructive/10 text-destructive mb-6">
          <AlertTriangle className="size-7" aria-hidden="true" />
        </div>
        <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">{t('invalidTitle')}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-6">{t('invalidBody')}</p>
        <Link
          href="/auth/forgot-password"
          className={`${CIBLE_LIEN_EN_LIGNE} inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline`}
        >
          {t('requestNewLink')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">
        {t('title')}
      </h1>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-8">
        {t.rich('subtitle', {
          email,
          b: (chunks) => <strong className="text-foreground">{chunks}</strong>,
        })}
      </p>

      <FormGlobalError>{globalError}</FormGlobalError>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1.5">
            {t('passwordLabel')}
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'password-error' : undefined}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('passwordPlaceholder')}
              className="h-11 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className={`absolute inset-y-0 right-0 my-auto mr-1 ${BASCULE_MOT_DE_PASSE}`}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <FormError id="password-error">{errors.password?.join(' ')}</FormError>
        </div>

        <div>
          <label htmlFor="password_confirmation" className="block text-sm font-medium mb-1.5">
            {t('confirmationLabel')}
          </label>
          <div className="relative">
            <Input
              id="password_confirmation"
              type={showPasswordConfirmation ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              value={passwordConfirmation}
              aria-invalid={errors.password_confirmation ? true : undefined}
              aria-describedby={
                errors.password_confirmation ? 'password_confirmation-error' : undefined
              }
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              placeholder={t('confirmationPlaceholder')}
              className="h-11 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPasswordConfirmation((v) => !v)}
              className={`absolute inset-y-0 right-0 my-auto mr-1 ${BASCULE_MOT_DE_PASSE}`}
              aria-label={
                showPasswordConfirmation ? t('hideConfirmation') : t('showConfirmation')
              }
            >
              {showPasswordConfirmation ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <FormError id="password_confirmation-error">
            {errors.password_confirmation?.join(' ')}
          </FormError>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full rounded-full h-11 text-base font-semibold"
        >
          {loading ? (
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
        <Link
          href="/auth/login"
          className={`${CIBLE_LIEN_EN_LIGNE} font-semibold text-primary underline-offset-4 hover:underline`}
        >
          {t('backToLogin')}
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
