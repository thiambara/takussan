import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin, isOwner, isCustomer, isServiceProvider, isTenant } from '@/lib/roles';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { getToken } from '@/lib/session';

export default async function OverviewPage() {
  const user = await getMeAction();
  const roles = user.roles;

  if (isAdmin(roles)) {
    // Cross-team agency dashboard is Standard-only; individual admins are
    // their only collaborator, so route them to the per-agent view instead
    // of letting /app/overview/agency bounce them back to /app.
    if (user.agency_id) {
      const token = await getToken();
      const agency = token ? await resolveAgencyOrNull(token, user.agency_id, 'overview (aiguillage)') : null;
      // FAIL-CLOSED, même raison qu'ailleurs : `fetchAgency` avale son erreur en `null`, donc
      // `if (agency && …)` laissait une agence `individual` sur la vue Standard dès que l'API
      // toussait. Ce site-ci n'est dans AUCUNE liste — ni PRO_ROUTES, ni les pages gardées —
      // il a été trouvé en cherchant la CLASSE du défaut plutôt que ses instances connues.
      if (!agency || agency.kind !== 'standard') redirect('/app/overview/agent');
    }
    redirect('/app/overview/agency');
  }
  if (isAgent(roles)) redirect('/app/overview/agent');
  if (isOwner(roles)) redirect('/app/overview/owner');
  if (isServiceProvider(roles)) redirect('/app/overview/tenant');
  if (isCustomer(roles) || isTenant(roles)) redirect('/app/overview/tenant');

  redirect('/app/overview/tenant');
}
