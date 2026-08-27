import type { Metadata } from 'next';
import { DataExportsPanel } from '@/components/privacy/DataExportsPanel';
import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.privacy');
  return { title: t('metaTitle') };
}

export default function AccountPrivacyPage() {
  const t = useTranslations('dashboard.pages.privacy');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <DataExportsPanel />
    </div>
  );
}
