'use client';

import { useTranslations } from 'next-intl';
import { AnnouncementsConsole } from '@/components/admin/super/announcements';
import { PageHeader } from '@/components/console';

export default function SuperAdminAnnouncementsPage() {
  const t = useTranslations('superAdmin.pages.announcements');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />

      <AnnouncementsConsole />
    </div>
  );
}
