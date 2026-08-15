'use client';

import { forgotPassword } from '@/lib/auth';
import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgotPassword');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await forgotPassword(email);
    } catch {
      // Toujours afficher succès pour éviter l'énumération des emails
    } finally {
      setSubmitted(true);
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div>
        <div className="flex items-center justify-center size-14 rounded-full bg-green-50 text-green-600 mb-6">
          <CheckCircle2 className="size-7" />
        </div>
        <h1 className="font-headline text-3xl font-bold tracking-tight mb-2">
          {t('sentTitle')}
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          {t.rich('sentBody', {
            email,
            b: (chunks) => <strong className="text-foreground">{chunks}</strong>,
          })}
        </p>
        <Link
          href="/auth/login"
          className="inline-block text-sm text-primary font-semibold hover:underline"
        >
          {t('backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight mb-2">
        {t('title')}
      </h1>
      <p className="text-muted-foreground text-sm mb-8">{t('subtitle')}</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">
            {t('email')}
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            className="h-11"
          />
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
        <Link href="/auth/login" className="text-primary font-semibold hover:underline">
          {t('backToLogin')}
        </Link>
      </p>
    </div>
  );
}
