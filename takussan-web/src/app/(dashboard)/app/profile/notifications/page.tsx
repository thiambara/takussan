import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { NotificationPreferencesMatrix } from '@/components/profile/NotificationPreferencesMatrix';
import { SectionDuProfil } from '@/components/profile/sommaire/SectionDuProfil';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.notificationPrefs');
  return { title: t('metaTitle') };
}

/**
 * TCK-2636 — les préférences de notification, par événement. TCK-2635 — une section du profil : son
 * titre au bureau à droite du sommaire, au téléphone l'en-tête de détail et sa flèche unique.
 */
export default async function ProfileNotificationsPage() {
  return (
    <SectionDuProfil section="notifications">
      <NotificationPreferencesMatrix />
    </SectionDuProfil>
  );
}
