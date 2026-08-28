import { RouteSkeleton } from '@/components/console';

/**
 * TCK-426 — ce repli vit dans le GROUPE `(accueil)`, et non plus à la racine de `/app`.
 *
 * Un `loading.tsx` ouvre une frontière de suspension : Next envoie la coque **et le code de
 * réponse** avant que la page n'ait rien décidé. Posé à la racine, celui-ci était l'ancêtre de
 * TOUT `/app` — il effaçait donc le statut de n'importe quelle page du sous-arbre qui n'avait
 * pas de repli plus proche. Mesuré sur Next 16.3.1 le 2026-08-27, sondes jetables sous
 * `next dev` (port 3999), quatre formes :
 *
 *     page `notFound()`  sans repli → 404   |  repli même segment → 200  |  repli ancêtre → 200
 *     page `redirect()`  sans repli → 307   |  repli même segment → 200  |  page SYNCHRONE → 200
 *     page `permanentRedirect()`  sans repli → 308  |  avec repli → 200
 *     layout `redirect()`  + repli DU MÊME SEGMENT → **307**, et le repli couvre toujours la page
 *     layout `redirect()`  + repli ANCÊTRE          → 200
 *
 * Un groupe de routes ne consomme aucun segment d'URL : `/app` est toujours servie par
 * `(accueil)/page.tsx`, avec ce repli. Mais `(accueil)/` n'est plus l'ancêtre de `crm/`,
 * `overview/`, `properties/`… — ces pages retrouvent le statut qu'elles décident.
 *
 * Coût mesuré du déplacement : UNE page perdait ce repli, `/app/crm`, qui ne rend aucun
 * document (elle ne fait qu'un `permanentRedirect`). Elle n'avait donc rien à montrer et payait
 * son 308 pour un squelette que personne ne voit.
 */
export default function Loading() {
  return <RouteSkeleton variant="dashboard" />;
}
