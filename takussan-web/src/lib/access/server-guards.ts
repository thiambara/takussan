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
  if (typeof user.agency_id !== 'number') return;
  const token = await getToken();
  if (!token) return;
  const agency = await fetchAgency(token, user.agency_id).catch(() => null);
  // FAIL-CLOSED : `!agency` redirige AUSSI.
  //
  // `fetchAgency` avale son erreur en `null`. Avec `if (agency && …)`, une API en panne ou
  // lente laissait donc s'afficher la console Standard-only à une agence `individual` — sur
  // les CINQ routes /admin/* qui passent par ce helper.
  //
  // Le même défaut avait été corrigé dans trois pages qui écrivent le test en ligne, et pas
  // ici : on avait réparé les instances et pas la classe. C'est le site le plus important des
  // deux, puisqu'il est partagé.
  if (!agency || agency.kind !== 'standard') redirect('/app');
}
