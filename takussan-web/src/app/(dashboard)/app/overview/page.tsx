import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin, isOwner, isServiceProvider, isTenant } from '@/lib/roles';
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
  // tableau de bord prestataire n'est spécifié : `docs/features.md` §2.5 en énumère quatre —
  // agence 🛡️, bailleur 🏢, agent 🧑‍💼, locataire 🏠 — et aucun pour 🔧. En inventer un serait
  // hors spec ; un prestataire qui atteint cette route par un signet est donc ramené à son
  // propre point d'entrée.
  //
  // ⚠ La justification a CHANGÉ DE SOURCE, et l'ancienne était en train de devenir fausse. Elle
  // disait « l'acteur 🔧 n'est même pas dans la légende » — c'est-à-dire qu'elle adossait un
  // comportement à une LACUNE de la spec. TCK-420 a comblé cette lacune : 🔧 entre dans la
  // légende, et §2.5 porte désormais la note qui TRANCHE l'absence de tableau de bord
  // prestataire. C'est cette note qu'il faut lire, et c'est une référence stable — là où
  // « l'acteur n'est pas dans la légende » se périmait au premier ticket qui l'y mettait.
  // *Une règle justifiée par un trou dans sa spec meurt le jour où le trou est bouché, même
  // quand la règle, elle, reste juste.*
  //
  // ⚠ Le test porte sur un prestataire PUR : les branches admin / agent / bailleur ci-dessus
  // s'appliquent d'abord, et un prestataire qui est AUSSI locataire garde sa vue locataire —
  // c'est son autre rôle qui la lui donne, pas celui-ci.
  //
  // ⚠ TCK-492 — la condition portait aussi `!isCustomer(roles)`. Le terme a été
  // retiré, et son retrait ne change RIEN au comportement : `customer` est
  // devenu le plancher de toute identité authentifiée, si bien que
  // `!isCustomer` était constamment faux et aurait empêché ce redirect de
  // s'appliquer à qui que ce soit — y compris au prestataire pur qu'il vise.
  // `!isTenant`, lui, discrimine réellement depuis que `tenant` est émis :
  // c'est lui qui porte désormais l'exception écrite ci-dessus.
  if (isServiceProvider(roles) && !isTenant(roles)) redirect('/app');

  // Tout le reste — acheteur, locataire, compte neuf — atterrit sur la vue
  // locataire. La ligne `if (isCustomer || isTenant) redirect(…)` qui précédait
  // ce redirect final visait la même destination : sous la nouvelle sémantique
  // elle serait devenue tautologique, et une condition toujours vraie devant un
  // inconditionnel identique se lit comme une garde alors qu'elle n'en est plus
  // une.
  redirect('/app/overview/tenant');
}
