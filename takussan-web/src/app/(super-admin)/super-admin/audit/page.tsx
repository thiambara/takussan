import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CrossTenantAuditTable } from '@/components/admin/super/CrossTenantAuditTable';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.audit');
  return { title: t('metaTitle') };
}

export default async function SuperAdminAuditPage() {
  const t = await getTranslations('superAdmin.pages.audit');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <CrossTenantAuditTable />
    </div>
  );
}
