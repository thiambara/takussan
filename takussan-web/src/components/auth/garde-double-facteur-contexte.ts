'use client';

import { createContext, useContext } from 'react';

import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';

/**
 * TCK-589 — le contexte de `GardeDoubleFacteur`, dans un module à part : `useApiMutation` le lit
 * sans tirer la boîte, l'enrôlement TOTP et ses actions serveur dans chaque écran qui mute.
 */
export const ContexteGardeDoubleFacteur = createContext<GardeDoubleFacteurFn | null>(null);

/** La garde des consoles, ou `null` hors d'elles — le refus remonte alors tel quel. */
export function useGardeDoubleFacteur(): GardeDoubleFacteurFn | null {
  return useContext(ContexteGardeDoubleFacteur);
}
