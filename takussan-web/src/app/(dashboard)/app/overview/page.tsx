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
      if (!agency || agency.kind !== 'standard') redirect('/app/overview/agent');
    }
    redirect('/app/overview/agency');
  }
  if (isAgent(roles)) redirect('/app/overview/agent');
  if (isOwner(roles)) redirect('/app/overview/owner');
  // TCK-379 — un `service_provider` était aiguillé ici vers `/app/overview/tenant`, c'est-à-dire
  // vers le tableau de bord LOCATAIRE, qui lui répond `has_customer_profile: false`. Aucun
  // tableau de bord prestataire n'est spécifié (`docs/features.md` §2.5 — l'acteur 🔧 n'est même
  // pas dans la légende), et en inventer un serait hors spec. Un prestataire qui atteint cette
  // route par un signet est donc ramené à son propre point d'entrée.
  //
  // ⚠ Le test porte sur un prestataire PUR : les branches admin / agent / bailleur ci-dessus
  // s'appliquent d'abord, et un prestataire qui est AUSSI locataire garde sa vue locataire —
  // c'est son autre rôle qui la lui donne, pas celui-ci.
  if (isServiceProvider(roles) && !isCustomer(roles) && !isTenant(roles)) redirect('/app');
  if (isCustomer(roles) || isTenant(roles)) redirect('/app/overview/tenant');

  redirect('/app/overview/tenant');
}
