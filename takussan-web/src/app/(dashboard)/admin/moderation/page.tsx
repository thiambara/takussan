import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isSuperAdmin } from '@/lib/roles';
import { ModerationWorkspace } from '@/components/admin/ModerationWorkspace';

/**
 * TCK-067 — Admin moderation queue. Only `super_admin` may access.
 */
export default async function ModerationPage() {
  const user = await getMeAction();
  if (!isSuperAdmin(user.roles)) redirect('/admin');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Modération</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          File d&apos;attente des avis en attente et signalés. Chaque action
          est consignée dans le journal d&apos;audit.
        </p>
      </div>
      <ModerationWorkspace />
    </div>
  );
}
