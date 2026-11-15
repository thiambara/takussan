import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CoqueDeLien } from '@/components/lien-public/CoqueDeLien';
import { ShareReception } from '@/components/share/ShareReception';

/**
 * `/[locale]/share/{token}` — TCK-587 §8 : la réception d'un lien de partage de document, hors de
 * `/app`, sans compte.
 *
 * TCK-2514 : dans la coque de lien nue (ni recherche, ni favoris, ni comparateur).
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

  return (
    <CoqueDeLien>
      <ShareReception token={token} />
    </CoqueDeLien>
  );
}
