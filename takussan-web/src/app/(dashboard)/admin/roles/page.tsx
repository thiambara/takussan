import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AdminRolesClient } from '@/components/admin/roles/AdminRolesClient';

/**
 * TCK-135 — `/admin/roles` editor for predefined and custom roles.
 *
 * The `(dashboard)/admin` layout already enforces an admin gate; we
 * hard-redirect here too so a stale link from `/app/...` can't leak the
 * page shell. Permission-level gating (`roles.manage_in_agency`) is
 * imposed by the backend — this server component just resolves the
 * caller's roles to short-circuit the unauthorized state without making
 * a wasted API round-trip.
 */
export default async function Page() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/profile');

  // `agency_admin` and `super_admin` both reach this page. Granular
  // control is enforced server-side by `roles.manage_in_agency`. We
  // pass `canManage` as a hint so a misseeded agency_admin sees a clear
  // empty state instead of an error toast.
  const canManage =
    user.roles.includes('super_admin') || user.roles.includes('agency_admin');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Rôles & Permissions</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Gestion des rôles et des accès de votre agence
        </p>
      </div>
      <AdminRolesClient canManage={canManage} />
    </div>
  );
}
