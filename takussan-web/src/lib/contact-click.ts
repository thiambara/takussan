import { apiFetch } from '@/lib/api';
import { arrivee } from '@/lib/attribution';

export type CanalDeContact = 'whatsapp' | 'call';

/**
 * TCK-590 — un clic WhatsApp / Appeler laisse une trace, sans identité : le canal et la source
 * d'arrivée. Elle sert au compte par bien, jamais à la file « à traiter ».
 *
 * Tirée en arrière-plan : son échec (limiteur, réseau) ne doit jamais retenir le geste du
 * visiteur — d'où l'absence d'`await` chez l'appelant et l'erreur avalée ici.
 */
export function signalerClic(slug: string, channel: CanalDeContact): void {
  void apiFetch(`/public/properties/${encodeURIComponent(slug)}/contact-click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, ...arrivee() }),
  }).catch(() => undefined);
}
