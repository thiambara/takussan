import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageDuLienDAction } from '@/components/lien-d-action/PageDuLienDAction';
import { CoqueDeLien } from '@/components/lien-public/CoqueDeLien';

/**
 * `/[locale]/fil/a/{jeton}` — TCK-2983 (ADR-0132 § 5) : la page du lien d'action du pont, UN geste sur
 * UN objet, sans session, dans la coque de lien nue. L'URL est celle qu'émet l'API (TCK-2982).
 *
 * Le titre est fixe (le jeton n'y entre jamais), la page n'est jamais indexée, et `no-referrer` (la
 * balise ici, l'en-tête dans `next.config.ts`) : le jeton EST le droit d'agir. La lecture part du
 * navigateur, jamais du rendu serveur : l'aperçu d'un lien par WhatsApp ne doit pas l'« ouvrir ».
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lienPublic.action');
  return {
    title: t('metaTitre'),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default async function PageDuLien({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <CoqueDeLien>
      <PageDuLienDAction jeton={token} />
    </CoqueDeLien>
  );
}
