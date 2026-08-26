import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AuditTrail } from '@/components/admin/AuditTrail';
import { PageHeader } from '@/components/console';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-104 — Admin audit trail page.
 * Requires agency_admin or super_admin role. Standard-only: agency_admins on
 * `kind=individual` are bounced to /app.
 */
export default async function AuditPage() {
  const t = await getTranslations('admin.pages.audit');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AuditTrail />
    </div>
  );
}
