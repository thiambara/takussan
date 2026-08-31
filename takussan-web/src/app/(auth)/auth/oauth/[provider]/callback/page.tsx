'use client';

import { Suspense, use, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { oauthCallback, type OAuthProvider } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { destinationInterne } from '@/lib/redirection-interne';
import { useAuth } from '@/context/AuthContext';
import { useTranslations } from 'next-intl';

const SUPPORTED_PROVIDERS: OAuthProvider[] = ['google', 'facebook', 'apple'];

function CallbackInner({ provider }: { provider: OAuthProvider }) {
  const t = useTranslations('auth.oauthCallback');
  const router = useRouter();
  const { refreshUser, setUser } = useAuth();
  const params = useSearchParams();
  const code = params.get('code');
  const state = params.get('state');
  const redirectTo = destinationInterne(params.get('redirect'));
  // TCK-493 — on ne va plus DIRECTEMENT à la destination. Une première connexion
  // Google atterrissait sur `/app`, c'est-à-dire un tableau de bord vide, sans
  // qu'on ait rien demandé au compte qui venait de se créer.
  //
  // ⚠ Ce n'est PAS une condition ici : cette page ne sait pas si le compte est
  // neuf, et le lui faire deviner produirait un quatrième juge. `/onboarding/intention`
  // décide, et renvoie vers `redirect` quand il n'a rien à demander — la
  // destination voulue est donc toujours atteinte, avec au plus un rebond.
  const apresConnexion = `/onboarding/intention?redirect=${encodeURIComponent(redirectTo)}`;

  useEffect(() => {
    if (!code || !state) {
      router.replace('/auth/login?error=oauth_invalid');
      return;
    }

    (async () => {
      try {
        const { token, user } = await oauthCallback(provider, code, state);
        await fetch('/api/auth/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        setUser(user);
        await refreshUser();
        router.replace(apresConnexion);
      } catch (err) {
        const msg = err instanceof ApiError ? 'oauth_failed' : 'oauth_unknown';
        router.replace(`/auth/login?error=${msg}`);
      }
    })();
  }, [provider, code, state, apresConnexion, router]);

  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <Loader2 className="size-10 animate-spin text-primary" />
      <h1 className="font-headline text-2xl font-bold tracking-tight">{t('title')}</h1>
      <p className="text-muted-foreground text-sm max-w-xs">{t('body')}</p>
    </div>
  );
}

export default function OAuthCallbackPage({
  params,
}: {
  params: Promise<{ provider: string }>;
}) {
  const t = useTranslations('auth.oauthCallback');
  const { provider: providerParam } = use(params);
  const provider = SUPPORTED_PROVIDERS.includes(providerParam as OAuthProvider)
    ? (providerParam as OAuthProvider)
    : null;

  const fallback = (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <Loader2 className="size-10 animate-spin text-primary" />
      <p className="text-muted-foreground text-sm">{t('title')}</p>
    </div>
  );

  if (!provider) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <h1 className="font-headline text-2xl font-bold tracking-tight">{t('unknownProvider')}</h1>
        <p className="text-muted-foreground text-sm max-w-xs">{t('unknownProviderBody')}</p>
      </div>
    );
  }

  return (
    <Suspense fallback={fallback}>
      <CallbackInner provider={provider} />
    </Suspense>
  );
}
