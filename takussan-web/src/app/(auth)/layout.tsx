import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';

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
        <div className="absolute inset-0 bg-gradient-to-br from-primary/70 via-primary/40 to-black/60" />
        <div className="relative z-10 h-full flex flex-col justify-between p-12 text-white">
          <Link
            href="/"
            className="font-headline font-bold text-2xl tracking-tight hover:opacity-90 transition-opacity"
          >
            {tCommon('appName')}
          </Link>
          <div>
            <h2 className="font-headline text-4xl font-bold mb-3 leading-tight">
              {t('headline')}
            </h2>
            <p className="text-white/85 max-w-md text-base">{t('subheadline')}</p>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center p-6 md:p-10 bg-background">
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
            className="absolute top-6 left-6 font-headline font-bold text-xl tracking-tight text-white"
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
