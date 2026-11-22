'use client';

import { useEffect } from 'react';

/**
 * TCK-2879 — la fiche d'une réservation s'ouvre sur l'ancre de l'URL (`#dossier`, `#paiement`), que
 * la carte de « Mes réservations » vise. Le navigateur ne la trouve pas à l'arrivée : la fiche est
 * encore un squelette. On y descend une fois la réservation lue, une seule fois.
 */
export function useAncreDeLaFiche(prete: boolean): void {
  useEffect(() => {
    if (!prete || typeof window === 'undefined') return;
    const ancre = window.location.hash.slice(1);
    if (!/^[a-z-]+$/.test(ancre)) return;
    document.getElementById(ancre)?.scrollIntoView?.({ block: 'start' });
  }, [prete]);
}
