'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { oauthProviders, oauthRedirect, type OAuthProvider } from '@/lib/auth';

type Provider = {
  id: OAuthProvider;
  label: string;
  Icon: () => React.ReactElement;
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.41-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
      />
    </svg>
  );
}

const PROVIDERS: Provider[] = [
  { id: 'google', label: 'Continuer avec Google', Icon: GoogleIcon },
  { id: 'apple', label: 'Continuer avec Apple', Icon: AppleIcon },
  { id: 'facebook', label: 'Continuer avec Facebook', Icon: FacebookIcon },
];

export function OAuthButtons() {
  const [pending, setPending] = useState<OAuthProvider | null>(null);
  const [error, setError] = useState('');
  const [availableProviders, setAvailableProviders] = useState<Set<OAuthProvider> | null>(null);

  useEffect(() => {
    let cancelled = false;

    oauthProviders()
      .then((providers) => {
        if (cancelled) return;
        setAvailableProviders(
          new Set(
            providers
              .filter((provider) => provider.configured)
              .map((provider) => provider.provider),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableProviders(new Set());
          setError("Impossible de charger les fournisseurs d'authentification.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleClick(provider: OAuthProvider) {
    setError('');
    setPending(provider);
    try {
      const { redirect_url } = await oauthRedirect(provider);
      window.location.assign(redirect_url);
    } catch {
      setError("Impossible d'initier la connexion. Réessayez dans quelques instants.");
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {availableProviders === null ? (
        <p className="text-center text-xs text-muted-foreground">Chargement des fournisseurs…</p>
      ) : null}
      {PROVIDERS.filter(({ id }) => availableProviders?.has(id)).map(({ id, label, Icon }) => (
        <Button
          key={id}
          type="button"
          variant="outline"
          onClick={() => handleClick(id)}
          disabled={pending !== null}
          className="w-full h-11 rounded-full gap-3 text-sm font-medium hover:shadow-sm transition-shadow"
        >
          {pending === id ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Icon />
          )}
          <span>{label}</span>
        </Button>
      ))}
      {availableProviders?.size === 0 && !error ? (
        <p className="text-center text-xs text-muted-foreground">
          Aucun fournisseur OAuth n&apos;est configuré sur cet environnement.
        </p>
      ) : null}
      {error && (
        <p className="text-xs text-destructive text-center" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function OAuthSeparator({ label = 'ou continuer avec email' }: { readonly label?: string }) {
  return (
    <div className="relative my-6">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs">
        <span className="bg-background px-3 text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
    </div>
  );
}
