import { destinationInterne } from '@/lib/redirection-interne';

import { lireActionDEntree } from './lien-connexion';
import type { IntentionDeLUrl } from './liens-de-l-entree';

/**
 * TCK-2606 — l'intention d'origine à travers le lien de vérification de l'adresse.
 *
 * Le lien du message (`/auth/verify-email/{id}/{hash}`) est fabriqué par l'API et ne porte que sa
 * signature : ouvert depuis la boîte, dans un AUTRE onglet, il menait à `/onboarding/intention`
 * sans destination — le visiteur venu réserver repartait de l'accueil.
 *
 * ⚠ **`localStorage`, et non `sessionStorage`** (celui de l'intention OAuth, `intention-oauth.ts`) :
 * le `sessionStorage` est PAR ONGLET, et le lien s'ouvre justement dans un autre. Même navigateur
 * seulement : depuis un autre appareil, rien n'est retrouvé et la sortie reste celle d'avant.
 *
 * Refiltrée à la lecture (le stockage est écrit par n'importe quel script de l'origine), oubliée
 * à l'usage, et périmée au bout d'un jour : un lien renvoyé le lendemain ne rouvre pas une
 * réservation d'hier.
 */
export const CLE_INTENTION_VERIFICATION = 'takussan:intention-verification';

const DUREE_DE_VIE_MS = 24 * 60 * 60 * 1000;

export function memoriserIntentionDeVerification({ redirect, action }: IntentionDeLUrl, maintenant = Date.now()): void {
  const destination = destinationInterne(redirect, '');
  try {
    if (destination === '') {
      window.localStorage.removeItem(CLE_INTENTION_VERIFICATION);
      return;
    }
    window.localStorage.setItem(CLE_INTENTION_VERIFICATION, JSON.stringify({ redirect: destination, action, le: maintenant }));
  } catch {
    // Stockage indisponible (navigation privée, bloqué) : la sortie reste celle d'avant.
  }
}

export function intentionDeVerificationMemorisee(maintenant = Date.now()): IntentionDeLUrl | null {
  try {
    const brute = window.localStorage.getItem(CLE_INTENTION_VERIFICATION);
    if (!brute) return null;
    const lue: unknown = JSON.parse(brute);
    if (typeof lue !== 'object' || lue === null) return null;
    const { redirect, action, le } = lue as Record<string, unknown>;
    if (typeof le !== 'number' || maintenant - le > DUREE_DE_VIE_MS || le > maintenant) return null;
    const destination = destinationInterne(typeof redirect === 'string' ? redirect : null, '');
    if (destination === '') return null;
    return { redirect: destination, action: lireActionDEntree(typeof action === 'string' ? action : null) };
  } catch {
    return null;
  }
}

export function oublierIntentionDeVerification(): void {
  try {
    window.localStorage.removeItem(CLE_INTENTION_VERIFICATION);
  } catch {
    // Rien à oublier.
  }
}
