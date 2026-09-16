'use client';

import { resendVerificationEmailAction } from '@/app/actions/auth';
import Link from 'next/link';
import { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormGlobalError } from '@/components/forms';
import { useTranslations } from 'next-intl';

export default function VerifyEmailPage() {
  const t = useTranslations('auth.verifyEmail');
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [loading, setLoading] = useState(false);

  async function handleResend() {
    setLoading(true);
    setStatus('idle');

    const result = await resendVerificationEmailAction();
    setStatus(result.ok ? 'sent' : 'error');
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center justify-center size-14 rounded-full bg-primary/10 text-primary mb-6">
        <Mail className="size-7" aria-hidden="true" />
      </div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">
        {t('title')}
      </h1>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-8">{t('body')}</p>

      {status === 'sent' && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success"
        >
          {t('resent')}
        </div>
      )}
      {status === 'error' && (
        <FormGlobalError className="mb-6">{t('resendFailed')}</FormGlobalError>
      )}

      <div className="space-y-3">
        <Button
          onClick={handleResend}
          disabled={loading}
          className="w-full rounded-full h-11 text-base font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('sending')}
            </>
          ) : (
            t('resend')
          )}
        </Button>

        {/* TCK-493 — même destination que le chemin OAuth : la question
            d'orientation, qui renvoie vers `/app` quand elle n'a rien à
            demander. Les deux chemins d'inscription posent la même question ;
            une question posée sur un seul ne mesure rien et laisse le défaut
            entier sur l'autre. */}
        <Link
          href="/onboarding/intention"
          className="flex min-h-11 items-center justify-center rounded-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t('continue')}
        </Link>
      </div>
    </div>
  );
}
