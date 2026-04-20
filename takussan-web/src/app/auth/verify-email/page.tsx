'use client';

import { resendVerificationEmailAction } from '@/app/actions/auth';
import Link from 'next/link';
import { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VerifyEmailPage() {
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
        <Mail className="size-7" />
      </div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight mb-2">
        Vérifiez votre adresse email
      </h1>
      <p className="text-muted-foreground text-sm mb-8">
        Nous avons envoyé un lien de vérification à votre adresse email. Cliquez sur le lien dans
        le message pour activer votre compte.
      </p>

      {status === 'sent' && (
        <div
          role="status"
          className="mb-6 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-4 py-3"
        >
          Email de vérification renvoyé. Pensez à vérifier votre dossier spam.
        </div>
      )}
      {status === 'error' && (
        <div
          role="alert"
          className="mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3"
        >
          Impossible de renvoyer l&apos;email. Réessayez dans quelques instants.
        </div>
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
              Envoi en cours…
            </>
          ) : (
            "Renvoyer l'email de vérification"
          )}
        </Button>

        <Link
          href="/dashboard"
          className="block text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Continuer vers le tableau de bord
        </Link>
      </div>
    </div>
  );
}
