import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { RadarClaimReception } from '@/components/radar-claim/RadarClaimReception';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';

/**
 * `/[locale]/claim/{token}` — TCK-2390 (ADR-0077 §3) : l'annonceur que le Radar a contacté vérifie
 * lui-même ses annonces avant leur publication, et confirme par un code reçu à son numéro.
 *
 * Jamais indexée, et `no-referrer` (la balise ici, l'en-tête dans `next.config.ts`) : le jeton signé
 * EST le droit de recevoir le code et de publier, et un `Referer` le porterait vers tout lien sortant.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('radarClaim');
  return {
    title: t('metaTitle'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('radarClaim');

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <NavbarSpacer />
      <main id={CONTENU_PRINCIPAL_ID} tabIndex={-1} className="flex-1 focus:outline-none">
        <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
          <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-balance text-foreground">
            {t('title')}
          </h1>
          <RadarClaimReception token={token} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
