import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { PropertyModerationWorkspace } from '@/components/admin/PropertyModerationWorkspace';
import { PageHeader } from '@/components/console';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-098 — Admin property moderation queue.
 * Both `agency_admin` and `super_admin` may access (role check enforced by backend).
 * Standard-only: agency_admins on `kind=individual` are bounced to /app.
 */
export default async function PropertyModerationPage() {
  const t = await getTranslations('admin.pages.propertyModeration');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <PropertyModerationWorkspace />
    </div>
  );
}
