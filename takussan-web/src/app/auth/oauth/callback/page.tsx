'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { oauthCallback, type OAuthProvider } from '@/lib/auth';
import { ApiError } from '@/lib/api';

const SUPPORTED_PROVIDERS: OAuthProvider[] = ['google', 'facebook', 'apple'];

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const providerParam = params.get('provider') ?? '';
  const code = params.get('code');
  const state = params.get('state');
  const rawRedirect = params.get('redirect') ?? '/dashboard';
  const redirectTo =
    rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/dashboard';

  useEffect(() => {
    const provider = SUPPORTED_PROVIDERS.includes(providerParam as OAuthProvider)
      ? (providerParam as OAuthProvider)
      : null;

    if (!provider || !code || !state) {
      router.replace('/auth/login?error=oauth_invalid');
      return;
    }

    (async () => {
      try {
        const { token } = await oauthCallback(provider, code, state);
        await fetch('/api/auth/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        router.replace(redirectTo);
      } catch (err) {
        const msg = err instanceof ApiError ? 'oauth_failed' : 'oauth_unknown';
        router.replace(`/auth/login?error=${msg}`);
      }
    })();
  }, [providerParam, code, state, redirectTo, router]);

  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <Loader2 className="size-10 animate-spin text-primary" />
      <h1 className="font-headline text-2xl font-bold tracking-tight">Connexion en cours…</h1>
      <p className="text-muted-foreground text-sm max-w-xs">
        Nous finalisons votre authentification. Merci de patienter quelques instants.
      </p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Connexion en cours…</p>
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
