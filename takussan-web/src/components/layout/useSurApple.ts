'use client';

import { useSyncExternalStore } from 'react';
import { estSurApple } from './usePaletteDeCommandes';

const sAbonnerARien = () => () => {};
const jamaisSurApple = () => false;

/**
 * TCK-2482 (A11), mis en commun par TCK-2491 — `⌘ K` sur Apple, `Ctrl K` ailleurs ; `Ctrl K` au rendu
 * serveur, sans écart d'hydratation. La détection est celle du raccourci (`estSurApple`) : ce qu'un
 * déclencheur de la palette annonce (`aria-keyshortcuts`, touches) est la touche qui ouvre (revue M2).
 */
export function useSurApple(): boolean {
  return useSyncExternalStore(sAbonnerARien, estSurApple, jamaisSurApple);
}

/** La valeur d'`aria-keyshortcuts` d'un déclencheur de la palette. */
export const raccourciDeLaPalette = (surApple: boolean) => (surApple ? 'Meta+K' : 'Control+K');
