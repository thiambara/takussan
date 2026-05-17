import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { TeamConsole } from '@/components/admin/TeamConsole';
import { PageHeader } from '@/components/layout/PageHeader';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';

/**
 * TCK-277 — unified team console (fusion of TCK-065 `/admin/team` and
 * TCK-133 `/admin/users`). Single screen with segmented tabs for the
 * different role typologies plus a single «&nbsp;Inviter&nbsp;» CTA.
 *
 * Super-admins without an `agency_id` see a stub directing them to pick
 * an agency from the dedicated section. Hosts on `kind=individual` are
 * bounced to `/app` by `ensureStandardAgencyOrRedirect`.
 */
export default async function TeamPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);

  if (!user.agency_id) {
    return (
      <div className="space-y-6">
        <PageHeader title="Équipe" subtitle="Gestion des membres de l'agence" />
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
      <PageHeader
        title="Équipe"
        subtitle="Gérez tous les membres de votre agence : agents, administrateurs, propriétaires. Invitez, attribuez des rôles, suspendez ou retirez un accès."
      />
      <TeamConsole agencyId={user.agency_id} currentUserId={user.id} />
    </div>
  );
}
