import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { TeamManagement } from '@/components/admin/TeamManagement';

/**
 * TCK-065 — Admin team management page. `agency_admin` and `super_admin`
 * can see and manage members of their agency. Superadmins without an
 * `agency_id` are redirected to /admin/agency where they can pick an agency.
 */
export default async function TeamPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');

  if (!user.agency_id) {
    // Super admins currently pick their working agency via /admin/agency.
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Équipe</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestion des membres de l&apos;agence
          </p>
        </div>
        <div className="rounded-xl bg-card p-8 text-sm text-muted-foreground">
          Vous n&apos;êtes rattaché à aucune agence. Rendez-vous dans la
          section « Configuration de l&apos;agence » pour en créer une ou en
          rejoindre une.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Équipe</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gérez les membres de votre agence : invitez des agents, attribuez
          des rôles, retirez un accès.
        </p>
      </div>
      <TeamManagement agencyId={user.agency_id} currentUserId={user.id} />
    </div>
  );
}
