import { apiFetch } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-599 (ADR-0050 §4) — l'alerte de recherche SANS compte, et les liens de ses e-mails.
 *
 * Contrat (`routes/api/saved-searches.php`) :
 * - `GET  /api/public/search-alerts/capabilities` → `{ data: { channels } }` — `whatsapp`
 *   n'apparaît que derrière `SEARCH_ALERTS_WHATSAPP_ENABLED`.
 * - `POST /api/public/search-alerts` → **202, toujours la même réponse** : rien ne dit si le
 *   contact est déjà connu, ni si un message est vraiment parti (plafonds silencieux).
 * - `POST /api/public/search-alerts/confirm` `{ token }` ou `{ phone, code }` → 200 / 422.
 * - `POST /api/public/search-alerts/unsubscribe` `{ token }` → 200, idempotent.
 * - `POST /api/saved-searches/{id}/unsubscribe?expires=…&signature=…` → coupe l'alerte d'un
 *   COMPTE depuis son e-mail, sans session (URL signée relative).
 *
 * ⚠ Tous des `POST` : un scanneur de liens qui suit le lien d'un e-mail ne confirme ni ne
 * désinscrit rien. Les pages ne déclenchent l'appel que sur un clic.
 */
export type PublicAlertChannel = 'email' | 'whatsapp';

export interface PublicSearchAlertPayload {
  readonly criteria: Record<string, unknown>;
  readonly name: string;
  readonly frequency: 'daily' | 'weekly';
  readonly channel: PublicAlertChannel;
  readonly email?: string;
  readonly phone?: string;
  readonly locale: string;
  readonly consent: true;
}

function post(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function fetchPublicAlertChannels(): Promise<PublicAlertChannel[]> {
  const res = await apiFetch<{ data: { channels: PublicAlertChannel[] } }>(
    '/public/search-alerts/capabilities',
  );
  return res.data.channels;
}

export async function createPublicSearchAlert(payload: PublicSearchAlertPayload): Promise<void> {
  await apiFetch('/public/search-alerts', post(payload));
}

export async function confirmPublicSearchAlert(
  body: { readonly token: string } | { readonly phone: string; readonly code: string },
): Promise<void> {
  await apiFetch('/public/search-alerts/confirm', post(body));
}

export async function unsubscribePublicSearchAlert(token: string): Promise<void> {
  await apiFetch('/public/search-alerts/unsubscribe', post({ token }));
}

/** Le lien signé d'une alerte de compte, tel que l'e-mail le porte vers la page du front. */
export interface AccountUnsubscribeLink {
  readonly searchId: number;
  readonly expires: string;
  readonly signature: string;
}

/**
 * Lit les paramètres de la page de désinscription. Ils viennent d'une URL, donc de n'importe qui :
 * un identifiant qui n'est pas un entier sûr, ou une signature qui n'a pas la forme d'un HMAC
 * hexadécimal, rend `null` — jamais un chemin d'API composé d'un `../` ou d'un `?` glissé.
 */
export function lireLienDeCompte(params: {
  readonly search?: string | null;
  readonly expires?: string | null;
  readonly signature?: string | null;
}): AccountUnsubscribeLink | null {
  const { search, expires, signature } = params;
  if (!search || !/^\d{1,15}$/.test(search)) return null;
  const searchId = Number(search);
  if (!Number.isSafeInteger(searchId) || searchId <= 0) return null;
  if (!expires || !/^\d{1,12}$/.test(expires)) return null;
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return null;
  return { searchId, expires, signature };
}

export async function unsubscribeAccountSearch(link: AccountUnsubscribeLink): Promise<void> {
  // L'ordre `expires` puis `signature` est celui que Laravel a signé : la signature relative
  // porte sur le chemin et la requête SANS elle-même.
  const qs = new URLSearchParams({ expires: link.expires, signature: link.signature });
  await apiFetch(cheminApi`/saved-searches/${link.searchId}/unsubscribe${qs}`, post({}));
}
