import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CoqueDeLien } from '@/components/lien-public/CoqueDeLien';
import { RadarClaimReception } from '@/components/radar-claim/RadarClaimReception';

/**
 * `/[locale]/claim/{token}` — TCK-2390 (ADR-0077 §3) : l'annonceur que le Radar a contacté vérifie
 * lui-même ses annonces avant leur publication, et confirme par un code reçu à son numéro.
 * TCK-2512 : dans la coque de lien nue (`CoqueDeLien` large : deux colonnes en bureau).
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

  return (
    <CoqueDeLien largeur="large">
      <RadarClaimReception token={token} />
    </CoqueDeLien>
  );
}
