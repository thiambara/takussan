'use client';

import { useRef } from 'react';

/**
 * TCK-1406 (ADR-0072 § 7) — la clé d'idempotence d'un formulaire qui écrit par une ACTION
 * SERVEUR. Une clé engendrée dans l'action serait neuve à chaque clic, donc ne protégerait de
 * rien : c'est le composant client qui l'engendre, une fois par soumission voulue, la passe à
 * l'action, la garde tant que l'action rend `{ ok: false }` et la renouvelle sur `{ ok: true }`
 * ou sur 422 `idempotency.key_reused` (la saisie a changé après un premier envoi arrivé).
 *
 * Pour une écriture par `useApiMutation`, l'option `idempotence` fait la même chose (TCK-1396).
 */
export function useCleIdempotence(): {
  readonly cle: () => string;
  readonly apres: (resultat: { readonly ok: boolean; readonly code?: string }) => void;
} {
  const cle = useRef<string | null>(null);
  return {
    cle: () => {
      cle.current ??= globalThis.crypto.randomUUID();
      return cle.current;
    },
    apres: (resultat) => {
      if (resultat.ok || resultat.code === 'idempotency.key_reused') cle.current = null;
    },
  };
}
