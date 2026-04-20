'use client';

import { ApiError } from '@/lib/api';
import { login } from '@/lib/auth';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OAuthButtons, OAuthSeparator } from '@/components/auth/OAuthButtons';
import { useAuth } from '@/context/AuthContext';

function LoginForm() {
  const router = useRouter();
  const { setUser } = useAuth();
  const searchParams = useSearchParams();
  const raw = searchParams.get('redirect') ?? '/dashboard';
  const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError('');
    setLoading(true);

    try {
      const { token, user } = await login({ email, password });

      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      setUser(user);
      router.push(redirectTo);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setGlobalError('Trop de tentatives. Réessayez dans quelques minutes.');
        } else if (err.status === 422 && err.data && typeof err.data === 'object' && 'errors' in err.data) {
          setErrors((err.data as { errors: Record<string, string[]> }).errors);
        } else {
          setGlobalError((err.data as { message?: string })?.message ?? 'Identifiants incorrects.');
        }
      } else {
        setGlobalError('La connexion au serveur a échoué. Vérifiez votre connexion internet et réessayez.');
      }
    } finally {
      setLoading(false);
    }
  }

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

      {globalError && (
        <div
          role="alert"
          className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3"
        >
          {globalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">
            Adresse email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            className="h-11"
          />
          {errors.email?.map((msg) => (
            <p key={msg} className="text-xs text-destructive mt-1">{msg}</p>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="block text-sm font-medium">
              Mot de passe
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-xs text-primary hover:underline font-medium"
            >
              Mot de passe oublié ?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password?.map((msg) => (
            <p key={msg} className="text-xs text-destructive mt-1">{msg}</p>
          ))}
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full rounded-full h-11 text-base font-semibold"
        >
          {loading ? (
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
