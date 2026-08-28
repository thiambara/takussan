import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { isAdmin } from '@/lib/roles';
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
  if (!token) redirect('/auth/login?redirect=/app/owners');

  // Le carnet des bailleurs est une surface agence.
  const isAgencySide =
    user.roles.includes('agency_admin') ||
    user.roles.includes('agent') ||
    isAdmin(user.roles) ||
    user.roles.includes('super_admin');
  if (!isAgencySide) redirect('/app');

  // Un super-admin sans contexte d'agence peut naviguer ailleurs ; cette page est par agence.
  const agencyId = user.agency_id;
  if (!agencyId) redirect('/app');

  // `decision` : ici le `kind` GARDE l'accès. Réservé aux agences `standard`
  // (`docs/features.md` §1.12) — dans une agence `individual`, l'utilisateur est par
  // construction le seul bailleur.
  //
  // `null` ne peut plus être une panne passagère : `resolveAgencyOrNull(..., 'decision')` les a
  // déjà renvoyées vers `/verification-indisponible`. Il ne reste que 401/403/404 — l'API a
  // répondu que cette agence n'est pas lisible par cet utilisateur. On refuse.
  const agency = await resolveAgencyOrNull(token, agencyId, 'owners', 'decision');
  if (!agency || agency.kind !== 'standard') redirect('/app');

  return <>{children}</>;
}
