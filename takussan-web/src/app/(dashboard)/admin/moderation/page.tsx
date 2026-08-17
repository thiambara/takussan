import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isSuperAdmin } from '@/lib/roles';
import { ModerationWorkspace } from '@/components/admin/ModerationWorkspace';
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
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <ModerationWorkspace />
    </div>
  );
}
