import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
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
 * la page (TTFB 0,053 s sur une page qui dort 1,5 s). Un `redirect()` de PAGE rend 200 dans tous
 * les cas — y compris depuis une page synchrone.
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
  if (!token) redirect('/auth/login?redirect=/app/maintenance/providers');

  const isAgencySide =
    user.roles.includes('agency_admin') ||
    user.roles.includes('agent') ||
    isAdmin(user.roles) ||
    user.roles.includes('super_admin');
  if (!isAgencySide) redirect('/app');

  // Par agence — mais le `kind` NE GARDE RIEN ici : le carnet est ouvert aux agences
  // `individual` comme `standard` (TCK-260). L'agence n'est résolue que par la page, pour
  // calculer `canInvite` — un détail d'interface que le backend re-vérifie. Ne pas la résoudre
  // ici : en faire une décision renverrait un 429 vers un écran d'échec d'autorisation pour une
  // page à laquelle l'utilisateur a droit.
  if (!user.agency_id) redirect('/app');

  return <>{children}</>;
}
