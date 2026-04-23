import { Suspense } from 'react';
import { PropertiesDiscoveryPage } from '@/components/property/PropertiesDiscoveryPage';

export const metadata = {
  title: 'Rechercher des biens – Takussan',
  description:
    'Trouvez des appartements, villas, terrains, bureaux et bien plus au Sénégal. Filtrez par prix, type, localisation et surface, visualisez les biens sur une carte interactive.',
};

/**
 * Wave 3 — `/properties` discovery surface. Embeds the shared filter rail,
 * the list/map view toggle, and the « Sauvegarder la recherche » CTA.
 */
export default function Page() {
  return (
    <Suspense>
      <PropertiesDiscoveryPage />
    </Suspense>
  );
}
