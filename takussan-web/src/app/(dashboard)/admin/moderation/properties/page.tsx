import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { PropertyModerationWorkspace } from '@/components/admin/PropertyModerationWorkspace';

/**
 * TCK-098 — Admin property moderation queue.
 * Both `agency_admin` and `super_admin` may access (role check enforced by backend).
 */
export default async function PropertyModerationPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Modération des biens</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          File d&apos;attente des biens soumis par les agents, en attente de validation avant
          publication.
        </p>
      </div>
      <PropertyModerationWorkspace />
    </div>
  );
}
