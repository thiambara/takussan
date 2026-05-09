import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AdminUsersClient } from './AdminUsersClient';

/**
 * TCK-133 — `/admin/users` agency-scoped users management. The
 * `(dashboard)/admin` layout already enforces the admin role gate, but
 * we hard-redirect non-admins here too so a stale `/app/...` link can't
 * leak the page shell. The actual data scope is imposed by the backend
 * (`ResolveActiveProfile` → `team_id`, TCK-141 / TCK-147), so this
 * server component only resolves the current user identity and hands it
 * to the client component for mutations + drawer state.
 */
export default async function Page() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/profile');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Gestion des utilisateurs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Comptes de votre agence</p>
      </div>
      <AdminUsersClient currentUserId={user.id} />
    </div>
  );
}
