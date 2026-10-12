import { AuditTrail } from '@/components/admin/AuditTrail';
import { PageHeader } from '@/components/console';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-104 — Admin audit trail page.
 * Requires agency_admin or super_admin role. Standard-only (TCK-633 : `PAGES_ADMIN`) — un admin
 * d'agence `individual` est renvoyé vers sa première page accessible.
 */
export default async function AuditPage() {
  await garderPageAdmin('/admin/audit');
  const t = await getTranslations('admin.pages.audit');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AuditTrail />
    </div>
  );
}
