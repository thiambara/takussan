import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin, isOwner } from '@/lib/roles';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { repliDeLaVueBailleur, vueBailleurOuverte } from '@/lib/access/tableau-du-bailleur';
import { getToken } from '@/lib/session';

export default async function OverviewPage() {
  const user = await getMeAction();
  const roles = user.roles;

  if (isAdmin(roles)) {
    // Cross-team agency dashboard is Standard-only. TCK-595 (AC7) — l'admin d'une agence
    // `individual` est un hôte : il gère SES biens, et `GET /api/dashboard/me` le résout déjà en
    // `owner`. Il était envoyé sur la vue agent, qui lui montrait un pipeline et des commissions
    // d'agent qu'il n'a pas.
    if (user.agency_id) {
      const token = await getToken();
      const agency = token ? await resolveAgencyOrNull(token, user.agency_id, 'overview (aiguillage)') : null;
      // FAIL-CLOSED, même raison qu'ailleurs : `fetchAgency` avale son erreur en `null`, donc
      // `if (agency && …)` laissait une agence `individual` sur la vue Standard dès que l'API
      // toussait. Ce site-ci n'est dans AUCUNE liste — ni PRO_ROUTES, ni les pages gardées —
      // il a été trouvé en cherchant la CLASSE du défaut plutôt que ses instances connues.
      // `affichage`, pas `decision` — et la distinction n'est pas cosmétique.
      //
      // Cette route N'EST PAS une surface réservée : elle ne figure dans aucune liste de garde.
      // Son seul travail est d'aiguiller vers la vue agence ou la vue agent, et les DEUX sont
      // légitimes pour cet utilisateur. En `decision`, une panne de trente secondes renvoyait
      // vers `/verification-indisponible` — c'est-à-dire remplaçait le tableau de bord par un
      // écran d'erreur sur la route d'atterrissage après connexion, là où le repli vers la vue
      // agent aurait montré une page qui marche.
      //
      // *`decision` se réserve aux endroits où `kind` GARDE l'accès. Ailleurs, ne pas savoir
      // doit dégrader, pas interrompre.*
      if (agency?.kind === 'individual') {
        // TCK-2260 (P116.07) — la vue bailleur ne s'offre qu'au bailleur, ou à l'admin qui détient
        // `reports.view_agency`. Capacités illisibles (`null`) : on aiguille quand même, le layout
        // de la vue décide — ici, ne pas savoir dégrade.
        if ((await vueBailleurOuverte(user)) === false) redirect(await repliDeLaVueBailleur(user));
        redirect('/app/overview/owner');
      }
      if (!agency || agency.kind !== 'standard') redirect('/app/overview/agent');
    }
    redirect('/app/overview/agency');
  }
  if (isAgent(roles)) redirect('/app/overview/agent');
  if (isOwner(roles)) redirect('/app/overview/owner');
  // Tout le reste — acheteur, locataire, prestataire, compte neuf — atterrit sur l'accueil.
  //
  // TCK-2625 — « Ma situation » (`/app/overview/tenant`) est absorbée par l'accueil du locataire et
  // du client ; elle ne rend plus qu'une redirection vers `/app`. Le prestataire y était déjà ramené
  // (TCK-379 : aucun tableau de bord prestataire n'est spécifié, `docs/features.md` §2.5) par une
  // branche `isServiceProvider && !isTenant` qui visait la même destination que ce repli : elle est
  // retirée — une condition devant un inconditionnel identique se lit comme une garde alors qu'elle
  // n'en est plus une.
  redirect('/app');
}
