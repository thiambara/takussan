import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { PayLinkReception, type RetourFournisseur } from '@/components/pay/PayLinkReception';

/**
 * `/[locale]/pay/{token}` — TCK-602 (ADR-0051 §1) : le lien de paiement d'une échéance, hors de
 * `/app`, sans compte.
 *
 * Jamais indexée, et `no-referrer` (la balise ici, l'en-tête dans `next.config.ts`) : le jeton EST
 * le droit de payer et de lire la quittance, et un `Referer` le porterait vers le fournisseur de
 * paiement comme vers tout lien sortant de la page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('payLink');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { token } = await params;
  const { status } = await searchParams;
  const retour: RetourFournisseur = status === 'success' || status === 'cancelled' ? status : null;
  const t = await getTranslations('payLink');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <NavbarSpacer />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-12">
          <h1 className="mb-6 text-center font-display text-2xl font-bold tracking-tight text-balance text-foreground">
            {t('title')}
          </h1>
          <PayLinkReception token={token} retour={retour} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
