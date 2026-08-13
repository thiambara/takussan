import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ApiError } from '@/lib/api';
import { fetchAgency } from '@/lib/queries/agencies';
import { getActiveProfileId, getToken } from '@/lib/session';
import type { Agency } from '@/types/agency';
import type { User } from '@/types/user';

/**
 * Une panne est-elle TRANSITOIRE, ou une réponse de l'API sur le fond ?
 *
 * 401/403/404 sont des réponses : l'agence n'existe pas, ou n'est pas lisible par cet
 * utilisateur. Refuser est alors la bonne réaction, et silencieuse.
 *
 * 429 et 5xx ne disent rien de l'agence — ils disent que l'API n'a pas répondu. Les traiter
 * comme un refus produit, pour l'utilisateur, quelque chose d'INDISCERNABLE d'un déclassement
 * de forfait : un `agency_admin` d'une agence `standard` se voit éjecté des cinq routes
 * `/admin/*`, tous les accès pro cadenassés dans la barre latérale, et pas un mot. Il conclut
 * qu'on lui a retiré son plan.
 *
 * *Fail-closed est la bonne règle pour la DÉCISION ; ce n'est pas une raison de mentir sur la
 * CAUSE.* On refuse toujours l'accès — mais on distingue « non » de « je n'ai pas pu demander ».
 */
/**
 * TROIS issues, parce qu'il y a trois situations — et deux passes de revue ont montré qu'en
 * n'en distinguant que deux, on en déguise toujours une.
 *
 *  · `refus`    — l'API a RÉPONDU sur le droit de cet utilisateur : 401, 403, 404. Le refus
 *                 silencieux vers `/app` est exact ; il n'y a rien à expliquer.
 *  · `explique` — l'API n'a pas donné de réponse utilisable : 400, 429, 5xx. Le refus est le
 *                 même, mais dire « vous n'y avez pas droit » serait faux. On envoie vers la
 *                 page qui dit « je n'ai pas pu demander ».
 *  · `bug`      — ce n'est pas une `ApiError` du tout. C'est une erreur de programmation, et
 *                 elle doit remonter COMME TELLE : la frontière d'erreur l'affiche avec un
 *                 `digest` exploitable. La déguiser en « réessayez dans un instant » produit une
 *                 impasse permanente sous un diagnostic rassurant et faux — aucun nombre de
 *                 tentatives n'y change rien, et rien n'en garde trace.
 *
 * Les deux versions précédentes ont chacune fondu une de ces trois dans une autre : d'abord les
 * bugs dans « transitoire », puis les 400 dans « refus ». *Une classification à deux cases pour
 * trois situations en écrase toujours une — et c'est celle qu'on n'a pas nommée.*
 */
type Verdict = 'refus' | 'explique' | 'bug';

/**
 * Une panne RÉSEAU se présente comme un `TypeError` — c'est ce que lève `fetch` quand la
 * connexion n'aboutit pas (`TypeError: fetch failed` chez undici). Elle appartient donc à
 * `explique`, pas à `bug`.
 *
 * Le test est étroit, sur la FORME du message, et c'est voulu : un `TypeError` de forme
 * (« Cannot read properties of undefined ») est un bug, et le router vers « réessayez dans un
 * instant » créerait une impasse permanente sous un diagnostic faux.
 *
 * *Deux causes qui portent le même type d'erreur ne se séparent que sur autre chose que le
 * type — ici le message, faute de mieux, et on le dit plutôt que de faire comme si.*
 */
const CAUSES_RESEAU = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
]);

const estPanneReseau = (e: Error): boolean => {
  // `fetch` d'undici lève très exactement `TypeError: fetch failed`, et range le détail dans
  // `cause.code`. On teste CELA, et non une liste de mots dans le message.
  //
  // La version précédente cherchait /fetch failed|network|ECONN|…|timeout/i dans `e.message`
  // de n'importe quelle erreur. Un `TypeError: Cannot read properties of undefined (reading
  // 'timeout')` — un bug ordinaire — tombait donc dans « explique » et devenait une invitation
  // à réessayer : l'impasse permanente sous diagnostic rassurant que le verdict « bug » existe
  // précisément pour empêcher.
  //
  // *Reconnaître une panne à des mots de son message, c'est reconnaître tout ce qui en parle.*
  if (e.name !== 'TypeError') return false;
  if (e.message === 'fetch failed') return true;
  const code = (e as { cause?: { code?: unknown } }).cause?.code;
  return typeof code === 'string' && CAUSES_RESEAU.has(code);
};

const classer = (e: unknown): Verdict => {
  if (!(e instanceof ApiError)) {
    return e instanceof Error && estPanneReseau(e) ? 'explique' : 'bug';
  }
  // 404 est DÉFINITIF ici : `AgencyController::show` fait `abort_unless(canViewAgency(), 404)`,
  // donc « invisible pour vous » — une réponse, pas une panne.
  return e.status === 401 || e.status === 403 || e.status === 404 ? 'refus' : 'explique';
};

/**
 * UNE requête d'agence par rendu, mémoïsée — le patron déjà employé par `getMeAction`.
 *
 * Chaque rendu de `/admin/*` en tirait DEUX : une dans le layout pour le cadenas (`affichage`),
 * une dans la page pour la décision. Rien ne les dédupliquait — `apiRequest` pose un
 * `Authorization` et aucune indication de cache. On doublait donc le débit sur le seul endpoint
 * dont le 429 vient d'être transformé en redirection dure : la requête du cadenas pouvait être
 * celle qui déclenche la limite qui éjecte la page.
 *
 * `cache()` de React est per-requête : deux appels du même rendu partagent la promesse, deux
 * rendus n'échangent rien. *Une garde qui coûte une requête par écran finit par créer la panne
 * contre laquelle elle protège.*
 */
const agenceDuRendu = cache(
  async (token: string, agencyId: number, activeProfileId?: string): Promise<Agency> =>
    fetchAgency(token, agencyId, activeProfileId),
);

/** Où l'on renvoie quand on n'a pas PU vérifier — distinct de `/app`, qui veut dire « non ». */
export const ROUTE_VERIF_INDISPONIBLE = '/verification-indisponible';

/**
 * Résout l'agence pour une DÉCISION d'accès, ou `null` — en laissant une trace.
 *
 * Le `.catch(() => null)` était écrit six fois, à l'identique, dans les deux layouts et les
 * quatre pages qui décident. Six copies d'un avaleur d'erreur, c'est six endroits où une panne
 * d'API devient indiscernable d'un déclassement d'agence : l'utilisateur est renvoyé sur `/app`
 * sans message, et le serveur n'en garde rien.
 *
 * Le refus reste inchangé — fail-closed est la bonne règle pour une autorisation. Ce qui change,
 * c'est qu'on peut désormais répondre à « pourquoi ? ». *Fail-closed décide de l'accès, pas de
 * ce qu'on a le droit de savoir.*
 *
 * `null` garde exactement le sens que chaque appelant lui donnait déjà : « on ne sait pas »,
 * donc refus côté décision, donc cadenas côté affichage.
 */
export async function resolveAgencyOrNull(
  token: string,
  agencyId: number,
  ou: string,
  /**
   * `'decision'` — la valeur sert à AUTORISER : une panne transitoire est relancée pour que la
   * frontière d'erreur de Next affiche « on n'a pas pu vérifier », au lieu d'une éjection muette.
   * `'affichage'` — la valeur ne sert qu'à peindre (cadenas de la barre latérale) : `null` suffit,
   * et faire tomber toute la page en erreur pour un cadenas serait pire que le cadenas.
   */
  usage: 'decision' | 'affichage' = 'affichage',
): Promise<Agency | null> {
  try {
    // Le hint de profil accompagne la requête — cf. le docblock de `fetchAgency`. Sans lui, un
    // compte multi-agences reçoit un 404 et se voit éjecté des neuf surfaces pro.
    const agence = await agenceDuRendu(token, agencyId, await getActiveProfileId());
    // ⚠ `fetchAgency` rend `res.data`, qui vaut `undefined` sur un 200 dont le corps n'a pas de
    // clé `data` — sans lever. Un commentaire antérieur rangeait ce cas parmi ceux qui
    // atteignent la page explicative ; il n'y arrivait pas, il tombait dans le `!agency` muet.
    // On le traite ici, à l'endroit où on l'observe : un corps illisible n'est pas une réponse
    // sur le forfait.
    if (!agence) {
      console.error(`[access] ${ou} : fetchAgency(${agencyId}) a rendu un corps sans \`data\`.`);
      if (usage === 'decision') redirect(ROUTE_VERIF_INDISPONIBLE);
      return null;
    }
    return agence;
  } catch (e: unknown) {
    // `redirect()` lève un NEXT_REDIRECT depuis le `try` ci-dessus : il doit ressortir intact.
    // Il ressortirait de toute façon — ce n'est pas une `ApiError`, donc `classer()` rend `bug`,
    // qui relance — mais on le nomme plutôt que de compter sur une coïncidence, et on ne le
    // journalise pas comme un échec. Next le marque par `digest`, pas par `message`.
    const digest = (e as { digest?: unknown } | null)?.digest;
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) throw e;
    const verdict = classer(e);
    console.error(
      `[access] ${ou} : fetchAgency(${agencyId}) a échoué (${verdict})`,
      e instanceof Error ? e.message : e,
    );
    // Un bug remonte comme un bug — avec sa pile, son `digest`, et sans explication inventée.
    //
    // ⚠ MAIS SEULEMENT pour un site de DÉCISION. Ce `throw` était placé avant le test sur
    // `usage`, ce qui contredisait frontalement le contrat écrit deux paragraphes plus haut :
    // « faire tomber toute la page en erreur pour un cadenas serait pire que le cadenas ».
    //
    // Le chemin est concret : `apiRequest` fait `response.json().catch(() => null)`, donc un 204
    // ou un corps non-JSON — une page d'interstitiel de proxy, une passerelle qui rend du vide —
    // donne `data === null`, et `fetchAgency` lève un `TypeError` sur `res.data`. Verdict
    // « bug », relancé depuis `app/layout.tsx` (dans un `Promise.all`, donc tout le layout
    // rejette) et depuis `admin/layout.tsx`. Toute la coquille `/app/*` et `/admin/*` basculait
    // sur la frontière d'erreur, là où l'ancien `.catch(() => null)` perdait juste un cadenas.
    //
    // *Un paramètre qui distingue deux contrats doit être consulté sur CHAQUE sortie, pas sur
    // celles auxquelles on pense.*
    if (verdict === 'bug') {
      if (usage === 'decision') throw e;
      return null;
    }
    // On REDIRIGE vers une page dédiée — on ne relance plus une erreur marquée.
    //
    // La version précédente levait une `Error` portant un marqueur, que `(dashboard)/error.tsx`
    // reconnaissait dans `error.message` pour afficher « nous n'avons pas pu vérifier vos accès »
    // au lieu du message générique. **Ce mécanisme est inopérant en production** : Next expurge
    // les messages d'erreur des Server Components dans un build de production — il ne transmet
    // qu'un `digest` — donc le test sur le message était toujours faux là où il comptait. Le
    // test unitaire, lui, restait vert : il vérifiait que la fonction LÈVE avec le marqueur,
    // ce qui est vrai des deux côtés.
    //
    // Une redirection ne dépend d'aucune sérialisation. `/app` continue de vouloir dire « non,
    // cette agence n'y a pas droit » ; cette route-ci dit « je n'ai pas pu demander » — deux
    // réponses différentes à deux questions différentes, et l'utilisateur voit laquelle.
    //
    // *Une distinction qui repose sur ce qu'un framework veut bien transporter n'est pas une
    // distinction : c'est un pari sur son mode de build.*
    //
    // Portée réelle : quand l'API entière est à terre, `getMeAction()` du layout échoue d'abord
    // et c'est la frontière d'erreur générique qui répond. Cette redirection couvre le cas où
    // `/api/agencies/{id}` SEUL échoue — rate-limit, surcharge ciblée. Voir le docblock de
    // `verification-indisponible/page.tsx`.
    if (usage === 'decision' && verdict === 'explique') redirect(ROUTE_VERIF_INDISPONIBLE);
    return null;
  }
}

/**
 * SSR guard for Standard-only surfaces (TCK-267 era / agency upgrade flow).
 * Redirects to `/app` when the caller's active agency is `kind=individual`.
 *
 * Used as a defense-in-depth complement to the sidebar padlock (`PRO_ROUTES`
 * + `isProRouteLocked`) and the backend `abort_unless` gate on the
 * underlying endpoint. Users without an `agency_id` (typically super_admins
 * without a tenant context) are allowed through — they can navigate the
 * cross-tenant console regardless of any single agency's kind.
 */
export async function ensureStandardAgencyOrRedirect(user: User): Promise<void> {
  // La SEULE sortie sans décision, et elle est délibérée : sans `agency_id`, il n'y a pas
  // d'agence dont juger le `kind` (super-admin hors contexte de tenant, cf. docblock).
  if (typeof user.agency_id !== 'number') return;

  // FAIL-CLOSED de bout en bout — et il a fallu QUATRE revues pour que ce soit vrai.
  //
  // 1. `fetchAgency` avale son erreur en `null` : `if (agency && …)` laissait s'afficher la
  //    console Standard-only à une agence `individual` dès que l'API toussait.
  // 2. Corrigé dans les pages qui écrivent le test en ligne, mais pas ici — l'instance, pas la
  //    classe. Ce site-ci est le plus important : il garde CINQ routes /admin/*.
  // 3. Corrigé ici aussi… en laissant un `if (!token) return;` juste au-dessus. La même porte,
  //    un cran plus haut : sans jeton, la décision n'était pas *prise*, elle était *sautée*.
  //
  // D'où la forme retenue, la même que dans les quatre pages sœurs : le jeton descend DANS
  // l'expression, il ne commande pas une sortie anticipée. Une seule condition, un seul refus,
  // aucun chemin qui contourne le `redirect`.
  //
  // *Un écran réservé se refuse quand on ne SAIT PAS, pas seulement quand on sait que non.*
  const token = await getToken();
  const agency = token
    ? await resolveAgencyOrNull(token, user.agency_id, 'ensureStandardAgencyOrRedirect', 'decision')
    : null;
  if (!agency || agency.kind !== 'standard') redirect('/app');
}
