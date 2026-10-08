import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { SearchAlertLinkAction } from '@/components/search-alerts/SearchAlertLinkAction';

/**
 * `/[locale]/search-alerts/unsubscribe` — TCK-599 (ADR-0050 §4, contrainte 6) : la désinscription
 * en UN bouton, depuis le lien d'un e-mail d'alerte. Deux formes de lien :
 *
 * - `?token=…` — un abonné sans compte : toutes ses alertes s'arrêtent, son contact est effacé ;
 * - `?search=ID&expires=…&signature=…` — l'alerte d'un compte : l'URL signée de l'API, rejouée
 *   en `POST` ; la recherche reste, son alerte passe à `off`.
 *
 * Jamais indexée, et `no-referrer` : le jeton ou la signature sont dans l'URL.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('search.alertPages.unsubscribe');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

function premier(valeur: string | string[] | undefined): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

export default async function SearchAlertUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations('search.alertPages.unsubscribe');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <NavbarSpacer />
      <main className="flex-1">
        <div className="mx-auto max-w-lg px-4 py-12">
          <h1 className="mb-6 text-center font-display text-2xl font-bold tracking-tight text-balance text-foreground">
            {t('title')}
          </h1>
          <SearchAlertLinkAction
            mode="unsubscribe"
            token={premier(params.token)}
            search={premier(params.search)}
            expires={premier(params.expires)}
            signature={premier(params.signature)}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
