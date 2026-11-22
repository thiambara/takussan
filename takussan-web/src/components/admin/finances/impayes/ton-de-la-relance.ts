'use client';

import { createContext, useContext } from 'react';

/**
 * TCK-2629 — le ton de « Jamais relancé ». Un seul composant Impayés, deux maquettes (ADR-0096 § 5) :
 * l'onglet de Rapports le met en ton d'alerte (`app-rapports`), « Argent » le garde en gris
 * (`app-argent-a`). Ce qui diffère passe par une propriété de `Impayes`, que la table et la carte lisent
 * ici plutôt que par trois composants intermédiaires.
 */
export const JamaisRelanceEnAlerte = createContext(false);

export function useJamaisRelanceEnAlerte(): boolean {
  return useContext(JamaisRelanceEnAlerte);
}

/** La classe du texte « jamais relancé » : alerte (Rapports) ou discrète (Argent). */
export const CLASSE_JAMAIS_EN_ALERTE = 'font-medium text-destructive';
