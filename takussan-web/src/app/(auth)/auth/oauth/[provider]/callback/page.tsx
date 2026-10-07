'use client';

import { Suspense, use, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  isOAuthTwoFactorChallenge,
  oauthCallback,
  oauthSecondFactor,
  type AuthResponse,
  type OAuthProvider,
} from '@/lib/auth';
import { DefiSecondFacteur } from '@/components/auth/DefiSecondFacteur';
import { ApiError } from '@/lib/api';
import { destinationInterne } from '@/lib/redirection-interne';
import { useAuth } from '@/context/AuthContext';
import { intentionOAuthMemorisee, oublierIntentionOAuth } from '@/components/auth/intention-oauth';
import { useTranslations } from 'next-intl';

const SUPPORTED_PROVIDERS: OAuthProvider[] = ['google', 'facebook', 'apple'];

function CallbackInner({ provider }: { provider: OAuthProvider }) {
  const t = useTranslations('auth.oauthCallback');
  const router = useRouter();
  const { refreshUser, openSession } = useAuth();
  const params = useSearchParams();
  const code = params.get('code');
  const state = params.get('state');
  const redirectParam = params.get('redirect');
  // TCK-493 — on ne va plus DIRECTEMENT à la destination. Une première connexion
  // Google atterrissait sur `/app`, c'est-à-dire un tableau de bord vide, sans
  // qu'on ait rien demandé au compte qui venait de se créer.
  //
  // ⚠ Ce n'est PAS une condition ici : cette page ne sait pas si le compte est
  // neuf, et le lui faire deviner produirait un quatrième juge. `/onboarding/intention`
  // décide, et renvoie vers `redirect` quand il n'a rien à demander — la
  // destination voulue est donc toujours atteinte, avec au plus un rebond.
  //
  // TCK-589 — le rappel du fournisseur ne porte pas `redirect` : la destination mémorisée dans
  // l'onglet au départ (`OAuthButtons`) prend le relais. Lue après le rappel : le stockage n'existe
  // pas au rendu serveur.
  //
  // TCK-589, vérification adverse B2 — un compte à 2FA reçoit un défi au lieu d'un jeton : la
  // page affiche la saisie du second facteur, et la session ne s'ouvre qu'après.
  const [defi, setDefi] = useState<string | null>(null);

  const ouvrir = useCallback(
    async ({ token, user, expires_at: expiresAt }: AuthResponse) => {
      const redirectTo = destinationInterne(redirectParam ?? intentionOAuthMemorisee());
      // TCK-509 — par le contexte : poser le cookie puis `setUser` laissait le jeton d'avant.
      await openSession(token, user, expiresAt);
      await refreshUser();
      oublierIntentionOAuth();
      router.replace(`/onboarding/intention?redirect=${encodeURIComponent(redirectTo)}`);
    },
    [redirectParam, router, openSession, refreshUser],
  );

  useEffect(() => {
    if (!code || !state) {
      router.replace('/auth/login?error=oauth_invalid');
      return;
    }

    (async () => {
      try {
        const reponse = await oauthCallback(provider, code, state);
        if (isOAuthTwoFactorChallenge(reponse)) {
          setDefi(reponse.challenge);
          return;
        }
        await ouvrir(reponse);
      } catch (err) {
        const msg = err instanceof ApiError ? 'oauth_failed' : 'oauth_unknown';
        router.replace(`/auth/login?error=${msg}`);
      }
    })();
  }, [provider, code, state, router, ouvrir]);

  if (defi !== null) {
    return (
      <DefiSecondFacteur
        onValider={async (preuve) => ouvrir(await oauthSecondFactor(defi, preuve))}
        onAnnuler={() => router.replace('/auth/login')}
      />
    );
  }

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
