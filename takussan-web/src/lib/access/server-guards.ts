import { redirect } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { fetchAgency } from '@/lib/queries/agencies';
import { getToken } from '@/lib/session';
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
const estTransitoire = (e: unknown): boolean =>
  !(e instanceof ApiError) || e.status === 429 || e.status >= 500;

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
    return await fetchAgency(token, agencyId);
  } catch (e: unknown) {
    const transitoire = estTransitoire(e);
    console.error(
      `[access] ${ou} : fetchAgency(${agencyId}) a échoué (${transitoire ? 'transitoire' : 'réponse API'})`,
      e instanceof Error ? e.message : e,
    );
    if (usage === 'decision' && transitoire) throw e;
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
