import { redirect } from 'next/navigation';
import { fetchAgency } from '@/lib/queries/agencies';
import { getToken } from '@/lib/session';
import type { User } from '@/types/user';

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
  const agency = token ? await fetchAgency(token, user.agency_id).catch(() => null) : null;
  if (!agency || agency.kind !== 'standard') redirect('/app');
}
