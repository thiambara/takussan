'use client';

import { useEffect, useState } from 'react';

import { ouvrirBrouillonLocal, type BrouillonLocal } from './brouillon-local';

/**
 * TCK-2601 — une annonce commencée sans compte attend-elle dans ce navigateur ? `null` tant que la
 * lecture n'a pas répondu, `false` au moindre doute.
 *
 * `/publish` en dépend : un visiteur qui revient CONNECTÉ (rechargement, retour de Google, de la
 * vérification de l'adresse) avec une annonce gardée retrouve l'assistant et sa feuille réduite à ce
 * qui manque, au lieu d'être mené ailleurs, l'annonce oubliée. La page n'agit qu'une fois la réponse
 * connue.
 */
export function useBrouillonLocalPresent(ouvrir: () => BrouillonLocal = () => ouvrirBrouillonLocal()): boolean | null {
  const [present, setPresent] = useState<boolean | null>(null);
  useEffect(() => {
    let annule = false;
    ouvrir()
      .ouvrir()
      .then((b) => {
        if (!annule) setPresent(b.valeurs !== null || b.photos.length > 0);
      })
      .catch(() => {
        if (!annule) setPresent(false);
      });
    return () => {
      annule = true;
    };
    // Une lecture, au montage : la page ne relit pas le brouillon que l'assistant écrit ensuite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return present;
}
