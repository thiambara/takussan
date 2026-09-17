import type { Metadata } from 'next';

import { PageLegale, metadonneesLegales } from '@/components/legal/PageLegale';

/**
 * `/[locale]/legal/privacy` — TCK-531, `docs/features.md` §2.10. Le texte : `src/content/legal/privacy.ts`.
 *
 * `noindex, follow` TOUJOURS, et non « tant que le texte manque » : une déclaration conditionnelle
 * ferait exiger la page au sitemap pendant qu'elle sert `noindex`. Ce n'est pas une page d'entrée
 * de recherche ; ses liens restent suivis.
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...(await metadonneesLegales('privacy')),
    robots: { index: false, follow: true },
  };
}

export default function Page() {
  return <PageLegale document="privacy" />;
}
