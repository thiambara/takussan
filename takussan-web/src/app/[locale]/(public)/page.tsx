import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';

import { HomepageDiscovery } from '@/components/property/HomepageDiscovery';
import { alternatesPubliques } from '@/lib/alternates';
import { isLocale } from '@/i18n/config';

/**
 * Canonique et hreflang de l'accueil — ADR-0026 §1, TCK-433.
 *
 * Le titre et la description restent portés par le layout du groupe : cette page ne les redéclare
 * pas, sans quoi le `title.template` (« %s — Takussan ») s'appliquerait au titre par défaut et
 * suffixerait deux fois.
 *
 * La canonique porte le préfixe de langue : `/fr` sur l'accueil français. Depuis TCK-434, `/` nu
 * rend 307 — une canonique non préfixée désignerait une redirection comme page de référence.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { alternates: alternatesPubliques('/', isLocale(locale) ? locale : 'fr') };
}

/**
 * Wave 3 homepage — hero (via Navbar), featured and latest property rows.
 * See `src/components/property/HomepageDiscovery.tsx` for the layout.
 */
export default function Home() {
  return <HomepageDiscovery />;
}
