'use client';

import { useSyncExternalStore } from 'react';

/**
 * TCK-2499 — la densité de la liste au téléphone : « Liste » (photo de 112 px, quatre à cinq biens
 * par écran) ou « Galerie » (la carte pleine largeur d'avant).
 *
 * - **« Liste » par défaut** : c'est la densité qui permet de comparer.
 * - **Mémorisée sur l'appareil** (`localStorage`), jamais dans l'URL : un lien partagé montre les
 *   mêmes filtres à quelqu'un qui préfère l'autre densité (contrainte du ticket).
 * - **Le rendu serveur vaut « Liste »** (`getServerSnapshot`) : l'appareil n'est pas connu du
 *   serveur. Un visiteur qui a choisi « Galerie » la retrouve à l'hydratation, sans écart
 *   d'hydratation : `useSyncExternalStore` rend d'abord l'instantané serveur, puis celui du client.
 *
 * Le stockage peut être interdit (navigation privée verrouillée, iframe cloisonnée) : le choix vit
 * alors en mémoire, le temps du document.
 */
export type Densite = 'liste' | 'galerie';

export const DENSITE_PAR_DEFAUT: Densite = 'liste';

/** Clé de `localStorage`. Exportée pour les tests. */
export const CLE_DENSITE = 'takussan:liste:densite';

const abonnes = new Set<() => void>();
let enMemoire: Densite | null = null;

function lire(): Densite {
  if (enMemoire !== null) return enMemoire;
  try {
    const brut = window.localStorage.getItem(CLE_DENSITE);
    if (brut === 'liste' || brut === 'galerie') return brut;
  } catch {
    // Stockage interdit : le défaut.
  }
  return DENSITE_PAR_DEFAUT;
}

export function choisirDensite(densite: Densite): void {
  enMemoire = densite;
  try {
    window.localStorage.setItem(CLE_DENSITE, densite);
  } catch {
    // Stockage interdit : le choix tient en mémoire.
  }
  abonnes.forEach((rappel) => rappel());
}

/** Pour les tests : oublie le choix tenu en mémoire. */
export function oublierDensite(): void {
  enMemoire = null;
}

function sAbonner(rappel: () => void): () => void {
  abonnes.add(rappel);
  // Un autre onglet qui change la densité la change ici aussi.
  const surStockage = (e: StorageEvent) => {
    if (e.key !== CLE_DENSITE) return;
    enMemoire = null;
    rappel();
  };
  window.addEventListener('storage', surStockage);
  return () => {
    abonnes.delete(rappel);
    window.removeEventListener('storage', surStockage);
  };
}

export function useDensite(): Densite {
  return useSyncExternalStore(sAbonner, lire, () => DENSITE_PAR_DEFAUT);
}
