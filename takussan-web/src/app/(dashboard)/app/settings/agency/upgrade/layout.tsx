import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { getToken } from '@/lib/session';

/**
 * TCK-426 — LA GARDE VIT DANS LE LAYOUT, ET C'EST LA SEULE PLACE OÙ ELLE GARDE VRAIMENT.
 *
 * Un `loading.tsx` ouvre une frontière de suspension : Next envoie la coque **et le code de
 * réponse** avant que la page n'ait rien décidé. Une garde écrite DANS la page rendait donc
 * `200` + `AppShell` + le squelette de la route interdite, puis rebondissait côté client — un
 * refus d'autorisation qui ressemble, pour tout ce qui n'est pas un navigateur, à un succès.
 *
 * Mesuré sur le Next 16.3.1 du dépôt (sondes jetables, `next dev -p 3999`) : un `redirect()` de
 * LAYOUT rend **307** malgré le `loading.tsx` du même segment, et le repli continue de couvrir
 * la page — **le squelette part avant que la page n'ait fini**. Un `redirect()` de PAGE rend 200
 * dans tous les cas, y compris depuis une page synchrone.
 *
 * ⚠ La PROPRIÉTÉ est mesurée, pas une durée. Une première rédaction écrivait « TTFB 0,053 s sur
 * une page qui dort 1,5 s » : ce chiffre venait d'une sonde NUE. Sur une vraie route de `/app`,
 * qui porte l'`AppShell` et son dictionnaire, on relève plutôt 0,5-0,7 s. *Une constante mesurée
 * sur un banc d'essai ne décrit pas ce qu'elle a servi à démontrer.*
 *
 * ⚠ Un layout ne se re-rend pas à chaque navigation CLIENTE sous son propre segment. Sans effet
 * ici : ces gardes portent sur le rôle et l'agence de l'utilisateur, qui ne changent pas au sein
 * d'une session.
 *
 * ⚠ Aucun appel d'API de plus : `getMeAction` et `resolveAgencyOrNull` sont mémoïsés par requête
 * (`cache()` de React), donc la page qui les rappelle partage la promesse de ce layout.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getMeAction();
  const token = await getToken();
  if (!token) redirect('/auth/login?redirect=/app/settings/agency/upgrade');

  const isAdminDeLAgence =
    user.roles.includes('agency_admin') || user.roles.includes('super_admin');
  if (!isAdminDeLAgence) redirect('/app');

  const agencyId = user.agency_id;
  if (!agencyId) redirect('/app');

  // `decision`, et cette page le mérite plus que toute autre : c'est celle où l'on vient
  // DEMANDER un changement de formule. En `affichage`, un 429 rendait `null`, la ligne
  // d'en-dessous renvoyait sur `/app`, et l'utilisateur lisait un déclassement là où il n'y
  // avait qu'une panne. En `decision`, une panne mène à `/verification-indisponible` et seuls
  // 401/403/404 mènent à `/app`.
  //
  // ⚠ Le `kind` lui-même ne garde RIEN : une agence déjà `standard` reçoit un panneau de
  // confirmation, pas un refus. Ce choix de CONTENU reste dans la page — seul le refus monte ici.
  if (!(await resolveAgencyOrNull(token, agencyId, 'settings/agency/upgrade', 'decision'))) {
    redirect('/app');
  }

  return <>{children}</>;
}
