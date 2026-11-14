'use client';

import { useEffect, useState } from 'react';

/**
 * TCK-2606 — le délai avant de pouvoir renvoyer un lien (« Renvoyer dans 60 s »), décompté chaque
 * seconde. `relancer(n)` le repart ; 0 : on peut renvoyer.
 *
 * Un délai du NAVIGATEUR, pas une promesse : il empêche le double envoi par impatience, l'API garde
 * ses propres bornes (`throttle:auth-password`, `throttle:6,1` du renvoi de vérification).
 */
export function useCompteARebours(initial = 0): readonly [number, (secondes: number) => void] {
  const [restant, setRestant] = useState(initial);

  useEffect(() => {
    if (restant <= 0) return;
    const minuteur = window.setTimeout(() => setRestant((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(minuteur);
  }, [restant]);

  return [restant, setRestant] as const;
}

/** Le délai entre deux envois d'un même lien. */
export const DELAI_DE_RENVOI_S = 60;
