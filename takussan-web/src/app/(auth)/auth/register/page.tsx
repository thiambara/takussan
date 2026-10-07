'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { ConnexionParTelephone } from '@/components/auth/ConnexionParTelephone';
import { useConnexionParTelephone } from '@/components/auth/useConnexionParTelephone';
import { BASCULE_MOT_DE_PASSE, CIBLE_LIEN_EN_LIGNE } from '@/components/auth/cibles';
import {
  FormInput,
  FormCheckbox,
  FormGlobalError,
} from '@/components/forms';
import { registerSchema, type RegisterFormValues } from '@/lib/schemas';
import { useApiForm } from '@/hooks/useApiForm';
import { register } from '@/lib/auth';
import { useAuth } from '@/context/AuthContext';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { ROUTES_LEGALES } from '@/lib/legal-routes';
import { avecRedirection, destinationInterne } from '@/lib/redirection-interne';
import { useTranslations } from 'next-intl';

function RegisterForm() {
  const t = useTranslations('auth.register');
  const router = useRouter();
  const { openSession } = useAuth();
  // TCK-589 — l'intention d'origine (`?redirect=`, posée par « Créer un compte ») traverse
  // l'inscription jusqu'à `/onboarding/intention`, qui la rend. Assainie à chaque relais.
  const redirectBrut = useSearchParams().get('redirect');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);
  // TCK-589 — inscription par téléphone en tête quand l'API la propose ; drapeau éteint, rien ne
  // change. Le formulaire e-mail reste à un clic.
  const tTelephone = useTranslations('auth.phoneLogin');
  const telephoneActif = useConnexionParTelephone();
  const [voieEmail, setVoieEmail] = useState(false);

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
    onSuccess: async ({ token, user, expires_at: expiresAt }) => {
      // TCK-509 — l'inscription posait le cookie sans RIEN dire au contexte, pas même `setUser` :
      // le compte fraîchement créé lisait l'API sans jeton jusqu'au prochain rechargement.
      // TCK-589 — et jamais sans jeton : `set-token` reçu vide EFFACE le cookie. Une réponse
      // sans jeton renvoie à la connexion plutôt que d'ouvrir une session vide.
      if (!token) {
        router.push(avecRedirection('/auth/login', redirectBrut));
        return;
      }
      await openSession(token, user, expiresAt);
      router.push(avecRedirection('/auth/verify-email', redirectBrut));
    },
  });

  const lienConnexion = (
    <p className="mt-6 text-center text-sm text-muted-foreground">
      {t('hasAccount')}{' '}
      <Link
        href={avecRedirection('/auth/login', redirectBrut)}
        className={`${CIBLE_LIEN_EN_LIGNE} font-semibold text-primary underline-offset-4 hover:underline`}
      >
        {t('loginCta')}
      </Link>
    </p>
  );

  if (telephoneActif && !voieEmail) {
    return (
      <div>
        <ConnexionParTelephone
          variante="register"
          // Le même numéro peut déjà porter un compte : le code y connecte alors, sans le dire
          // à l'écran (aucune fuite d'existence). Un compte créé passe par l'orientation (TCK-493).
          onConnecte={(nouveauCompte) =>
            router.push(
              nouveauCompte
                ? avecRedirection('/onboarding/intention', redirectBrut)
                : destinationInterne(redirectBrut),
            )
          }
          onEmail={() => setVoieEmail(true)}
        />
        <OAuthButtons separator="before" separatorLabel={t('oauthSeparator')} redirect={redirectBrut} />
        {lienConnexion}
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-balance mb-2">
        {t('title')}
      </h1>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty mb-8">{t('subtitle')}</p>

      <FormGlobalError>{globalError}</FormGlobalError>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormInput<RegisterFormValues>
            name="first_name"
            control={form.control}
            label={t('firstName')}
            autoComplete="given-name"
            className="h-11"
            required
          />
          <FormInput<RegisterFormValues>
            name="last_name"
            control={form.control}
            label={t('lastName')}
            autoComplete="family-name"
            className="h-11"
            required
          />
        </div>

        <FormInput<RegisterFormValues>
          name="email"
          control={form.control}
          label={t('email')}
          type="email"
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          className="h-11"
          required
        />

        <FormInput<RegisterFormValues>
          name="password"
          control={form.control}
          label={t('password')}
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder={t('passwordPlaceholder')}
          className="h-11 pr-12"
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className={BASCULE_MOT_DE_PASSE}
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />

        <FormInput<RegisterFormValues>
          name="password_confirmation"
          control={form.control}
          label={t('passwordConfirmation')}
          type={showPasswordConfirmation ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder={t('passwordConfirmationPlaceholder')}
          className="h-11 pr-12"
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowPasswordConfirmation((v) => !v)}
              className={BASCULE_MOT_DE_PASSE}
              aria-label={
                showPasswordConfirmation ? t('hideConfirmation') : t('showConfirmation')
              }
            >
              {showPasswordConfirmation ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />

        <FormCheckbox<RegisterFormValues>
          name="accept_cgu"
          control={form.control}
          required
          label={t.rich('acceptTerms', {
            terms: (chunks) => (
              <LienLocalise
                href={ROUTES_LEGALES.terms}
                target="_blank"
                rel="noopener"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {chunks}
              </LienLocalise>
            ),
            privacy: (chunks) => (
              <LienLocalise
                href={ROUTES_LEGALES.privacy}
                target="_blank"
                rel="noopener"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {chunks}
              </LienLocalise>
            ),
          })}
        />

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-full h-11 text-base font-semibold"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('submitting')}
            </>
          ) : (
            t('submit')
          )}
        </Button>
      </form>

      <OAuthButtons
        separator="before"
        separatorLabel={t('oauthSeparator')}
        redirect={redirectBrut}
      />

      {telephoneActif ? (
        <p className="mt-4 text-center">
          <button
            type="button"
            className="min-h-11 rounded-lg px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            onClick={() => setVoieEmail(false)}
          >
            {tTelephone('usePhone')}
          </button>
        </p>
      ) : null}

      {lienConnexion}
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
