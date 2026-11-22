import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CoqueDeLien } from '@/components/lien-public/CoqueDeLien';
import { PayLinkReception, type RetourFournisseur } from '@/components/pay/PayLinkReception';

/**
 * `/[locale]/pay/{token}` — TCK-602 (ADR-0051 §1) : le lien de paiement d'une échéance, hors de
 * `/app`, sans compte. TCK-2505 : dans la coque de lien NUE (`CoqueDeLien`) — ni recherche, ni
 * favoris, ni comparateur, ni barre d'onglets.
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

  return (
    <CoqueDeLien>
      <PayLinkReception token={token} retour={retour} />
    </CoqueDeLien>
  );
}
