import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AuditTrail } from '@/components/admin/AuditTrail';
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
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <AuditTrail />
    </div>
  );
}
