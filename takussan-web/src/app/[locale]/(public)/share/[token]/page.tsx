import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { ShareReception } from '@/components/share/ShareReception';

/**
 * `/[locale]/share/{token}` — TCK-587 §8 : la réception d'un lien de partage de document, hors de
 * `/app`, sans compte.
 *
 * Jamais indexée, et `no-referrer` : le jeton EST le droit d'accès, et un `Referer` le porterait
 * vers tout lien sortant de la page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shareReception');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations('shareReception');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <NavbarSpacer />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="mb-6 text-center font-display text-2xl font-bold tracking-tight text-balance text-foreground">
            {t('title')}
          </h1>
          <ShareReception token={token} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
