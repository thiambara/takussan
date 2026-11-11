import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getMeAction } from '@/app/actions/auth';
import { ProfileLayout } from '@/components/profile/ProfileLayout';
import { NotificationPreferencesMatrix } from '@/components/profile/NotificationPreferencesMatrix';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.notificationPrefs');
  return { title: t('metaTitle') };
}

export default async function ProfileNotificationsPage() {
  const t = await getTranslations('dashboard.notificationPrefs');
  const tConsole = await getTranslations('console.pageHeader');
  // Force a session check — if the user isn't authenticated, getMeAction
  // redirects them to /auth/login.
  await getMeAction();

  return (
    <ProfileLayout>
      <PageHeader
        // TCK-2636 — le fil « Profil › Notifications » dès `md` (`FilDAriane`, TCK-2617) ; au téléphone,
        // la flèche unique de l'en-tête de la coque. L'ancien sur-titre fait main restait au téléphone.
        fil={{
          label: tConsole('breadcrumb'),
          etapes: [{ label: t('breadcrumbProfile'), href: '/app/profile' }, { label: t('breadcrumbCurrent') }],
        }}
        title={t('title')}
        description={t('subtitle')}
      />

      <NotificationPreferencesMatrix />
    </ProfileLayout>
  );
}
