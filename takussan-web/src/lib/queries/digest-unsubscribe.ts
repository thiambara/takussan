import { apiFetch } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * P97.06 (TCK-1243, ADR-0050) — se désabonner du résumé par courriel depuis son lien, sans session.
 *
 * Contrat (`routes/api/notifications.php`) :
 * - `POST /api/notifications/digest/unsubscribe/{user}?expires=…&signature=…` → 200,
 *   `{ data: { email_frequency: 'off' } }`, idempotent ; 403 sur une signature fausse ou expirée.
 *
 * ⚠ Un `POST` : un analyseur de liens qui ouvre la page ne désabonne personne. La page ne
 * déclenche l'appel que sur un clic.
 */
export interface DigestUnsubscribeLink {
  readonly userId: number;
  readonly expires: string;
  readonly signature: string;
}

/**
 * Lit les paramètres de la page. Ils viennent d'une URL, donc de n'importe qui : un identifiant qui
 * n'est pas un entier sûr, ou une signature qui n'a pas la forme d'un HMAC hexadécimal, rend `null`
 * — jamais un chemin d'API composé d'un `../` ou d'un `?` glissé.
 */
export function lireLienDuResume(params: {
  readonly user?: string | null;
  readonly expires?: string | null;
  readonly signature?: string | null;
}): DigestUnsubscribeLink | null {
  const { user, expires, signature } = params;
  if (!user || !/^\d{1,15}$/.test(user)) return null;
  const userId = Number(user);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  if (!expires || !/^\d{1,12}$/.test(expires)) return null;
  if (!signature || !/^[0-9a-f]{64}$/.test(signature)) return null;
  return { userId, expires, signature };
}

export async function unsubscribeDigest(link: DigestUnsubscribeLink): Promise<void> {
  // L'ordre `expires` puis `signature` est celui que Laravel a signé.
  const qs = new URLSearchParams({ expires: link.expires, signature: link.signature });
  await apiFetch(cheminApi`/notifications/digest/unsubscribe/${link.userId}${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}
