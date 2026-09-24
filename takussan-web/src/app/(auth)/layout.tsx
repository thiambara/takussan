import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { ArriveeEnHaut } from '@/components/auth/ArriveeEnHaut';
import { ReinitialiserSessionClient } from '@/components/auth/ReinitialiserSessionClient';
import { RetourAuth } from '@/components/auth/RetourAuth';

/**
 * Auth layout — centered form panel with a visual panel on desktop.
 *
 * Applied to all routes inside `(auth)` (login, register, forgot-password,
 * reset-password, verify-email, oauth). Routes stay on `/auth/...` URLs —
 * the parentheses make the segment URL-invisible while still grouping the
 * layout.
 *
 * SEO: noindex for all auth pages — these are transactional.
 */
// `metadata` est une constante figée à la compilation : elle ne peut pas voir la locale de la
// requête. `generateMetadata` le peut, et c'est la seule primitive qui traduise un titre d'onglet.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.meta');
  return {
    title: {
      template: t('template'),
      default: t('default'),
    },
    robots: { index: false, follow: false },
  };
}

/**
 * i18n (TCK-337) : frontière de dictionnaire du groupe `(auth)`.
 *
 * ⚠ Le layout exporté est `async` — il doit l'être pour attendre `messagesPour` — et le panneau
 * visuel est extrait dans un composant SYNCHRONE juste en dessous. Ce n'est pas de la coquetterie :
 * `useTranslations` de next-intl 4 est appelable dans un composant serveur **à la seule condition
 * qu'il ne soit pas `async`**. Fusionner les deux rendrait le layout muet, sans erreur de type.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <IntlProvider messages={await messagesPour('(auth)')}>
      {/* TCK-509 — arriver ici avec une session côté client : le serveur dit si elle est périmée. */}
      <ReinitialiserSessionClient />
      {/* TCK-568 — arriver d'une page défilée ouvrait l'écran défilé, le retour hors de la vue. */}
      <ArriveeEnHaut />
      <AuthPanneau>{children}</AuthPanneau>
    </IntlProvider>
  );
}

function AuthPanneau({ children }: { children: ReactNode }) {
  const t = useTranslations('auth.layout');
  const tCommon = useTranslations('common');

  return (
    <div className="min-h-screen grid lg:grid-cols-[45%_55%]">
      {/* Visual panel — desktop left */}
      <div className="relative hidden lg:block">
        <Image
          src="https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1600&auto=format&fit=crop"
          alt={t('visualAlt')}
          fill
          priority
          className="object-cover"
          sizes="45vw"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/70 via-primary/40 to-scrim/60" />
        <div className="relative z-10 h-full flex flex-col justify-between p-12 text-white">
          <Link
            href="/"
            className="self-start rounded-md font-headline font-bold text-2xl tracking-tight transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-foreground/70"
          >
            {tCommon('appName')}
          </Link>
          <div>
            <h2 className="font-headline text-4xl font-bold tracking-tight text-balance mb-3 leading-tight">
              {t('headline')}
            </h2>
            <p className="text-white/85 max-w-md text-base leading-relaxed text-pretty">{t('subheadline')}</p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      {/* `lg:pt-24` : le retour est posé en absolu à 32 px du haut, 44 px de haut — il finit à 76 px.
          Un formulaire plus haut que la fenêtre (l'inscription, de 1024 à 1180 px de large) commence
          au rembourrage du panneau : à 40 px, son titre passait SOUS le retour (revue du
          2026-09-23, « Dellu » imprimé sur « Sos sa kont »). 96 px laissent 20 px d'air. */}
      <div className="relative flex items-center justify-center p-6 md:p-10 lg:pt-24 bg-background">
        {/* TCK-568 — un retour vers la page quittée (la recherche, typiquement) : le logo seul
            menait à l'accueil. Discret à côté du formulaire dès `lg`.
            Sur la bannière mobile, blanc SUR UN VOILE : posé nu sur la photo, le texte de 14 px
            mesurait 4,4:1 au médian et 2:1 au pire sous ses lettres (320 et 390 px, 2026-09-23) —
            sous le 4,5:1 d'un texte de cette taille, là où la photo est claire. */}
        <RetourAuth
          libelle={t('back')}
          className="absolute left-3 top-3 z-20 bg-scrim/40 text-white backdrop-blur-sm hover:bg-scrim/55 hover:text-white focus-visible:ring-primary-foreground/70 lg:left-8 lg:top-8 lg:bg-transparent lg:text-muted-foreground lg:backdrop-blur-none lg:hover:bg-muted lg:hover:text-foreground lg:focus-visible:ring-ring"
        />
        {/* Mobile banner */}
        <div className="lg:hidden absolute top-0 inset-x-0 h-[28vh] overflow-hidden -z-0">
          <Image
            src="https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=1200&auto=format&fit=crop"
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/60 via-primary/30 to-background" />
          <Link
            href="/"
            className="absolute top-3 right-3 inline-flex min-h-11 items-center rounded-md px-3 font-headline font-bold text-xl tracking-tight text-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary-foreground/70"
          >
            {tCommon('appName')}
          </Link>
        </div>

        <div className="w-full max-w-md animate-fade-in-up lg:mt-0 mt-[22vh] relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
}
