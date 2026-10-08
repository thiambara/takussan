import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { SearchAlertLinkAction } from '@/components/search-alerts/SearchAlertLinkAction';

/**
 * `/[locale]/search-alerts/confirm?token=…` — TCK-599 (ADR-0050 §4) : le lien de confirmation
 * d'une alerte sans compte. Confirmer est un clic, jamais le chargement de la page.
 *
 * Jamais indexée, et `no-referrer` : le jeton est dans l'URL, un `Referer` le porterait vers tout
 * lien sortant de la page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('search.alertPages.confirm');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

function premier(valeur: string | string[] | undefined): string | null {
  return typeof valeur === 'string' ? valeur : null;
}

export default async function SearchAlertConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations('search.alertPages.confirm');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <NavbarSpacer />
      <main className="flex-1">
        <div className="mx-auto max-w-lg px-4 py-12">
          <h1 className="mb-6 text-center font-display text-2xl font-bold tracking-tight text-balance text-foreground">
            {t('title')}
          </h1>
          <SearchAlertLinkAction mode="confirm" token={premier(params.token)} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
