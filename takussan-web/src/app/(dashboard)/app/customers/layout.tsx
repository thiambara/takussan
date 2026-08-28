import { getMeAction } from '@/app/actions/auth';
import { assertCanReachAgentArea } from '@/lib/auth/guards';

/**
 * TCK-426 — LA GARDE VIT DANS LE LAYOUT, ET C'EST LA SEULE PLACE OÙ ELLE GARDE VRAIMENT.
 *
 * Un `loading.tsx` ouvre une frontière de suspension : Next envoie la coque **et le code de
 * réponse** avant que la page n'ait rien décidé. Une garde écrite DANS la page rendait donc
 * `200` + `AppShell` + le squelette de la route interdite, puis rebondissait côté client — un
 * refus d'autorisation qui ressemble, pour tout ce qui n'est pas un navigateur, à un succès.
 *
 * Mesuré sur le Next 16.3.1 du dépôt (sondes jetables, `next dev -p 3999`, `curl -w
 * '%%{http_code}'`) : un `redirect()` de LAYOUT rend **307** malgré le `loading.tsx` du même
 * segment — et le repli continue de couvrir la page, c'est-à-dire que **le squelette part AVANT
 * que la page n'ait fini**. Un layout ANCÊTRE garde aussi son statut au-dessus du repli d'un
 * descendant. Un `redirect()` de PAGE, lui, rend 200 dans tous les cas — y compris depuis une
 * page synchrone.
 *
 * ⚠ La PROPRIÉTÉ est mesurée, pas une durée. Une première rédaction écrivait ici « TTFB 0,053 s
 * sur une page qui dort 1,5 s » : ce chiffre venait d'une sonde NUE, sans `AppShell`, sans
 * dictionnaire i18n, sans lecture de cookie. Sur une vraie route de `/app` on relève plutôt
 * 0,5-0,7 s, et la propriété tient toujours — mais un chiffre écrit dans quatorze fichiers du
 * produit se lit comme une caractéristique du produit. *Une constante mesurée sur un banc d'essai
 * ne décrit pas ce qu'elle a servi à démontrer.*
 *
 * *Un statut survit si et seulement s'il est décidé STRICTEMENT AU-DESSUS de toute frontière de
 * suspension de son chemin.*
 *
 * ⚠ Un layout ne se re-rend pas à chaque navigation CLIENTE sous son propre segment. C'est sans
 * effet ici : ces gardes portent sur le rôle et sur l'agence de l'utilisateur, qui ne changent
 * pas au sein d'une session. Une garde qui dépendrait de la RESSOURCE (« ce dossier-ci est-il le
 * vôtre ? ») ne pourrait PAS vivre ici.
 *
 * ⚠ Aucun appel d'API de plus : `getMeAction` et `resolveAgencyOrNull` sont mémoïsés par requête
 * (`cache()` de React), donc la page qui les rappelle partage la promesse du layout.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  // Couvre `customers`, `customers/new` ET `customers/[id]` : un layout d'ancêtre est au-dessus
  // du repli de chacun des trois segments (mesuré). Les trois portaient la MÊME garde, recopiée.
  assertCanReachAgentArea((await getMeAction()).roles);
  return <>{children}</>;
}
