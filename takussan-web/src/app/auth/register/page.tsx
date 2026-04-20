'use client';

import { ApiError } from '@/lib/api';
import { register } from '@/lib/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { OAuthButtons, OAuthSeparator } from '@/components/auth/OAuthButtons';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirmation: '',
  });
  const [acceptCgu, setAcceptCgu] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setGlobalError('');

    if (!acceptCgu) {
      setGlobalError('Vous devez accepter les conditions générales pour continuer.');
      return;
    }

    setLoading(true);

    try {
      const { token } = await register(form);

      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      router.push('/auth/verify-email');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422 && err.data && typeof err.data === 'object' && 'errors' in err.data) {
          setErrors((err.data as { errors: Record<string, string[]> }).errors);
        } else {
          setGlobalError((err.data as { message?: string })?.message ?? 'La création du compte a échoué.');
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
        Créez votre compte
      </h1>
      <p className="text-muted-foreground text-sm mb-8">
        Rejoignez Takussan et gérez vos recherches et vos biens en toute simplicité.
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="first_name" className="block text-sm font-medium mb-1.5">
              Prénom
            </label>
            <Input
              id="first_name"
              type="text"
              autoComplete="given-name"
              required
              value={form.first_name}
              onChange={update('first_name')}
              className="h-11"
            />
            {errors.first_name?.map((msg) => (
              <p key={msg} className="text-xs text-destructive mt-1">{msg}</p>
            ))}
          </div>
          <div>
            <label htmlFor="last_name" className="block text-sm font-medium mb-1.5">
              Nom
            </label>
            <Input
              id="last_name"
              type="text"
              autoComplete="family-name"
              required
              value={form.last_name}
              onChange={update('last_name')}
              className="h-11"
            />
            {errors.last_name?.map((msg) => (
              <p key={msg} className="text-xs text-destructive mt-1">{msg}</p>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">
            Adresse email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update('email')}
            placeholder="vous@exemple.com"
            className="h-11"
          />
          {errors.email?.map((msg) => (
            <p key={msg} className="text-xs text-destructive mt-1">{msg}</p>
          ))}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1.5">
            Mot de passe
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={update('password')}
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
            value={form.password_confirmation}
            onChange={update('password_confirmation')}
            className="h-11"
          />
        </div>

        <label className="flex items-start gap-3 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={acceptCgu}
            onChange={(e) => setAcceptCgu(e.target.checked)}
            className="mt-0.5 size-4 rounded border-border accent-primary"
            aria-describedby="cgu-help"
          />
          <span id="cgu-help">
            J&apos;accepte les{' '}
            <Link href="/terms" className="text-primary hover:underline">conditions générales</Link>{' '}
            et la{' '}
            <Link href="/privacy" className="text-primary hover:underline">politique de confidentialité</Link>.
          </span>
        </label>

        <Button
          type="submit"
          disabled={loading}
          className="w-full rounded-full h-11 text-base font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Création…
            </>
          ) : (
            'Créer mon compte'
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Déjà un compte ?{' '}
        <Link href="/auth/login" className="text-primary font-semibold hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  );
}
