import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PrivacyRequestsConsole } from '@/components/admin/super/PrivacyRequestsConsole';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.privacyRequests');
  return { title: t('metaTitle') };
}

/**
 * TCK-601 (G) — « Demandes de droits » : le registre des demandes d'accès, de rectification,
 * d'opposition, d'effacement et de portabilité. Super-admin seul — le layout de la console le
 * garde, et l'API rend 403 à tout autre lecteur (`PrivacyRequestPolicy`).
 */
export default async function SuperAdminPrivacyRequestsPage() {
  const t = await getTranslations('superAdmin.pages.privacyRequests');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <PrivacyRequestsConsole />
    </div>
  );
}
