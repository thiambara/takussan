import { PropertyModerationWorkspace } from '@/components/admin/PropertyModerationWorkspace';
import { PageHeader } from '@/components/console';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-098 — Admin property moderation queue.
 * Both `agency_admin` and `super_admin` may access (role check enforced by backend).
 * Standard-only (TCK-633 : `PAGES_ADMIN`) — un admin d'agence `individual` est renvoyé vers sa
 * première page accessible.
 */
export default async function PropertyModerationPage() {
  await garderPageAdmin('/admin/moderation/properties');
  const t = await getTranslations('admin.pages.propertyModeration');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <PropertyModerationWorkspace />
    </div>
  );
}
