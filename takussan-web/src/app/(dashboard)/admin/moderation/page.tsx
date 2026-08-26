import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isSuperAdmin } from '@/lib/roles';
import { ModerationWorkspace } from '@/components/admin/ModerationWorkspace';
import { PageHeader } from '@/components/console';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-067 — Admin moderation queue. Only `super_admin` may access.
 */
export default async function ModerationPage() {
  const t = await getTranslations('admin.pages.moderation');
  const user = await getMeAction();
  if (!isSuperAdmin(user.roles)) redirect('/admin');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <ModerationWorkspace />
    </div>
  );
}
