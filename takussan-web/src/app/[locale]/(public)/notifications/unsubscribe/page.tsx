import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { DigestUnsubscribeAction } from '@/components/notifications/DigestUnsubscribeAction';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

/**
 * `/[locale]/notifications/unsubscribe` — P97.06 (TCK-1183, modèle d'ADR-0050) : le désabonnement
 * du résumé par e-mail en UN bouton, depuis le lien du résumé (`?user=ID&expires=…&signature=…`,
 * l'URL signée de l'API, rejouée en `POST`). Publique : le lien s'ouvre souvent hors session.
 *
 * Jamais indexée, et `no-referrer` : la signature est dans l'URL.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('digestUnsubscribe');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

function premier(valeur: string | string[] | undefined): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

export default async function DigestUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations('digestUnsubscribe');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <NavbarSpacer />
      <main id={CONTENU_PRINCIPAL_ID} tabIndex={-1} className="flex-1 focus:outline-none">
        <div className="mx-auto max-w-lg px-4 py-12">
          <h1 className="mb-6 text-center font-display text-2xl font-bold tracking-tight text-balance text-foreground">
            {t('title')}
          </h1>
          <DigestUnsubscribeAction
            user={premier(params.user)}
            expires={premier(params.expires)}
            signature={premier(params.signature)}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
