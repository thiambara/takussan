'use client';

import { ApiError } from '@/lib/api';
import { resetPassword } from '@/lib/auth';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const email = searchParams.get('email') ?? '';

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
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
          setGlobalError((err.data as { message?: string })?.message ?? 'La réinitialisation a échoué.');
        }
      } else {
        setGlobalError('La connexion au serveur a échoué. Vérifiez votre connexion internet et réessayez.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (!token || !email) {
    return (
      <div>
        <div className="flex items-center justify-center size-14 rounded-full bg-red-50 text-red-600 mb-6">
          <AlertTriangle className="size-7" />
        </div>
        <h1 className="font-headline text-3xl font-bold tracking-tight mb-2">Lien invalide</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Ce lien de réinitialisation est invalide ou a expiré. Demandez-en un nouveau.
        </p>
        <Link
          href="/auth/forgot-password"
          className="inline-block text-sm text-primary font-semibold hover:underline"
        >
          Demander un nouveau lien
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight mb-2">
        Nouveau mot de passe
      </h1>
      <p className="text-muted-foreground text-sm mb-8">
        Choisissez un nouveau mot de passe pour <strong className="text-foreground">{email}</strong>.
      </p>

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
          <label htmlFor="password" className="block text-sm font-medium mb-1.5">
            Nouveau mot de passe
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Au moins 8 caractères"
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

        <div>
          <label htmlFor="password_confirmation" className="block text-sm font-medium mb-1.5">
            Confirmer le mot de passe
          </label>
          <Input
            id="password_confirmation"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={8}
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.target.value)}
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
              Réinitialisation…
            </>
          ) : (
            'Définir le nouveau mot de passe'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/auth/login" className="text-primary font-semibold hover:underline">
          ← Retour à la connexion
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
