import type { Metadata } from 'next';

import { HomepageDiscovery } from '@/components/property/HomepageDiscovery';
import { alternatesLangues } from '@/lib/alternates';

/**
 * hreflang de l'accueil — ADR-0026 §1.
 *
 * Le titre et la description restent portés par le layout du groupe : cette page ne les redéclare
 * pas, sans quoi le `title.template` (« %s — Takussan ») s'appliquerait au titre par défaut et
 * suffixerait deux fois.
 */
export function generateMetadata(): Metadata {
  return { alternates: alternatesLangues('/') };
}

/**
 * Wave 3 homepage — hero (via Navbar), featured and latest property rows.
 * See `src/components/property/HomepageDiscovery.tsx` for the layout.
 */
export default function Home() {
  return <HomepageDiscovery />;
}
