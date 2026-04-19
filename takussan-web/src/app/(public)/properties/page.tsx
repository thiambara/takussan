import { Suspense } from 'react';
import { PropertiesPage } from '@/components/search/PropertiesPage';

export const metadata = {
  title: 'Rechercher des biens – Takussan',
  description: 'Trouvez des appartements, villas, terrains, bureaux et bien plus au Sénégal. Filtrez par prix, type, localisation et surface.',
};

export default function Page() {
  return (
    <Suspense>
      <PropertiesPage />
    </Suspense>
  );
}
