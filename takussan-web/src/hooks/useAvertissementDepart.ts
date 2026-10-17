'use client';

import { useEffect } from 'react';

/**
 * Avertit avant de quitter la page (rechargement, onglet fermé, lien externe) tant que `actif`
 * est vrai — d'ordinaire `isDirty` d'un formulaire long (P08.06, TCK-755). Le navigateur affiche
 * son propre message : aucun texte n'est fourni. La navigation interne de Next ne déclenche pas
 * `beforeunload` et n'est pas couverte.
 */
export function useAvertissementDepart(actif: boolean): void {
  useEffect(() => {
    if (!actif) return;
    const avertir = (evenement: BeforeUnloadEvent) => {
      evenement.preventDefault();
      // Chrome et Edge exigent encore `returnValue` pour afficher la boîte.
      evenement.returnValue = '';
    };
    window.addEventListener('beforeunload', avertir);
    return () => window.removeEventListener('beforeunload', avertir);
  }, [actif]);
}
