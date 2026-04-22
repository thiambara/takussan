'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { OAuthButtons, OAuthSeparator } from '@/components/auth/OAuthButtons';
import {
  FormInput,
  FormCheckbox,
  FormGlobalError,
} from '@/components/forms';
import { registerSchema, type RegisterFormValues } from '@/lib/schemas';
import { useApiForm } from '@/hooks/useApiForm';
import { register } from '@/lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const defaultValues: RegisterFormValues = {
    first_name: '',
    last_name: '',
    email: '',
    password: '',
    password_confirmation: '',
    accept_cgu: false,
  };

  const { form, isSubmitting, globalError, handleSubmit } = useApiForm<RegisterFormValues, Awaited<ReturnType<typeof register>>>({
    schema: registerSchema,
    defaultValues,
    formOptions: { mode: 'onTouched' },
    onSubmit: async (values) => {
      // `accept_cgu` is UI-only — the backend doesn't expect it.
      const { accept_cgu, ...payload } = values;
      void accept_cgu;
      return register(payload);
    },
    onSuccess: async ({ token }) => {
      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      router.push('/auth/verify-email');
    },
  });

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

      <FormGlobalError>{globalError}</FormGlobalError>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="grid grid-cols-2 gap-4">
          <FormInput<RegisterFormValues>
            name="first_name"
            control={form.control}
            label="Prénom"
            autoComplete="given-name"
            className="h-11"
            required
          />
          <FormInput<RegisterFormValues>
            name="last_name"
            control={form.control}
            label="Nom"
            autoComplete="family-name"
            className="h-11"
            required
          />
        </div>

        <FormInput<RegisterFormValues>
          name="email"
          control={form.control}
          label="Adresse email"
          type="email"
          autoComplete="email"
          placeholder="vous@exemple.com"
          className="h-11"
          required
        />

        <FormInput<RegisterFormValues>
          name="password"
          control={form.control}
          label="Mot de passe"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Au moins 8 caractères"
          className="h-11 pr-10"
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="pr-1 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />

        <FormInput<RegisterFormValues>
          name="password_confirmation"
          control={form.control}
          label="Confirmer le mot de passe"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          className="h-11"
          required
        />

        <FormCheckbox<RegisterFormValues>
          name="accept_cgu"
          control={form.control}
          required
          label={
            <>
              J&apos;accepte les{' '}
              <Link href="/terms" className="text-primary hover:underline">
                conditions générales
              </Link>{' '}
              et la{' '}
              <Link href="/privacy" className="text-primary hover:underline">
                politique de confidentialité
              </Link>
              .
            </>
          }
        />

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full h-11 text-base font-semibold"
        >
          {isSubmitting ? (
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
