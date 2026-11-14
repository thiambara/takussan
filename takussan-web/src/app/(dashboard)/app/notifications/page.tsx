import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { NotificationsHistory } from '@/components/notifications/NotificationsHistory';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.notifications');
  return { title: t('metaTitle') };
}

/**
 * TCK-2634 — la tête de page (titre, « N non lues · N à traiter », « Préférences », « Tout marquer comme
 * lu ») est rendue par l'historique lui-même : ses comptes viennent de la même lecture que la liste.
 */
export default function Page() {
  return <NotificationsHistory />;
}
