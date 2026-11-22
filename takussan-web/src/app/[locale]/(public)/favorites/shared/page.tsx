import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { SelectionPartagee } from '@/components/favorites/SelectionPartagee';

/**
 * TCK-2508 — la sélection partagée : `/[locale]/favorites/shared?ids=1,2,3`.
 *
 * Un instantané d'identifiants de biens, lu par `by-ids` (aucun objet neuf côté API) : un bien
 * devenu non public disparaît en silence. `noindex` — une sélection n'a pas de version de
 * référence à désigner, et son adresse change avec chaque envoi.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('favorites.selection.meta');
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return (
    <Suspense>
      <SelectionPartagee />
    </Suspense>
  );
}
