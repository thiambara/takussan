import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { isAdmin, isAgent } from '@/lib/roles';
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
  if (!isAdmin(user.roles) && !isAgent(user.roles)) redirect('/app/overview');

  // Tableau de bord cross-équipe : agences `standard` uniquement (`docs/features.md` §1.12).
  //
  // FAIL-CLOSED de bout en bout, et la forme compte autant que le test. `resolveAgencyOrNull`
  // avale son erreur en `null` : un `if (agency && …)` laisserait s'afficher l'écran réservé dès
  // que l'API tousse. Mais imbriquer le tout sous `if (token)` rouvre la même porte un cran plus
  // haut — sans jeton, la garde est sautée au lieu d'être prise. Le jeton descend donc DANS
  // l'expression : une seule condition, un seul refus.
  //
  // *Un écran réservé se refuse quand on ne SAIT PAS, pas seulement quand on sait que non.*
  //
  // ⚠ `'decision'` est repris À L'IDENTIQUE de la page : ce ticket déplace une garde, il n'en
  // change pas le verdict. Ici le `kind` GARDE l'accès, contrairement à l'aiguilleur
  // `overview/page.tsx` qui, lui, se contente de choisir une destination et reste en
  // `'affichage'`.
  if (user.agency_id) {
    const token = await getToken();
    const agency = token
      ? await resolveAgencyOrNull(token, user.agency_id, 'overview/agency', 'decision')
      : null;
    if (!agency || agency.kind !== 'standard') redirect('/app');
  }

  return <>{children}</>;
}
