'use client';

import { forgotPassword } from '@/lib/auth';
import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await forgotPassword(email);
    } catch {
      // Toujours afficher succès pour éviter l'énumération des emails
    } finally {
      setSubmitted(true);
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div>
        <div className="flex items-center justify-center size-14 rounded-full bg-green-50 text-green-600 mb-6">
          <CheckCircle2 className="size-7" />
        </div>
        <h1 className="font-headline text-3xl font-bold tracking-tight mb-2">
          Vérifiez votre boîte mail
        </h1>
        <p className="text-muted-foreground text-sm mb-6">
          Si un compte existe pour <strong className="text-foreground">{email}</strong>, un lien de
          réinitialisation vient de vous être envoyé. Il est valable 60 minutes.
        </p>
        <Link
          href="/auth/login"
          className="inline-block text-sm text-primary font-semibold hover:underline"
        >
          ← Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight mb-2">
        Mot de passe oublié
      </h1>
      <p className="text-muted-foreground text-sm mb-8">
        Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de
        passe.
      </p>

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
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full rounded-full h-11 text-base font-semibold"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Envoi en cours…
            </>
          ) : (
            'Envoyer le lien'
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
