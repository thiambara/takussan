'use client';

import { createContext, useContext } from 'react';
import type { IdDestination } from '@/lib/navigation/catalogue';
import type { ModeIcones } from '@/lib/navigation/mode-icones';
import type { Persona } from '@/lib/navigation/personas';
import { NAVIGATION_VIDE, type PreferencesDeNavigation } from '@/lib/navigation/preferences';

/**
 * TCK-2480 — le contexte des préférences du menu, À PART de son fournisseur (`PreferencesDuMenu.tsx`) :
 * le fournisseur lit la valeur de l'API par zod (`preferences-schema.ts`), et zod n'entre sur une page
 * publique que par un formulaire (TCK-744). La barre d'onglets publique (TCK-2493) lit ce hook par
 * `useMenuDeLEspace`, sans fournisseur : elle reçoit le repli inerte.
 */
export interface PreferencesDuMenu {
  /** `false` sans fournisseur (tests, coque montée ailleurs) : la barre ne propose aucun geste. */
  readonly actif: boolean;
  /** Le persona que la coque affiche — celui que la section « Menu » du profil réinitialise. */
  readonly persona: Persona | null;
  readonly navigation: PreferencesDeNavigation;
  readonly modeIcones: ModeIcones;
  readonly basculerEpingle: (persona: Persona, id: IdDestination, rendues: readonly string[]) => void;
  readonly basculerRepli: (persona: Persona, groupe: string, replie: boolean, replieParDefaut: boolean) => void;
  readonly masquerDemarrer: (persona: Persona) => void;
  readonly reinitialiser: (persona: Persona) => void;
  readonly choisirModeIcones: (mode: ModeIcones) => void;
}

const rien = () => {};

/** Sans fournisseur : inerte, mode `complet` — la barre se rend comme avant TCK-2480 (A12). */
const REPLI: PreferencesDuMenu = {
  actif: false,
  persona: null,
  navigation: NAVIGATION_VIDE,
  modeIcones: 'complet',
  basculerEpingle: rien,
  basculerRepli: rien,
  masquerDemarrer: rien,
  reinitialiser: rien,
  choisirModeIcones: rien,
};

export const Contexte = createContext<PreferencesDuMenu | null>(null);

export function usePreferencesDuMenu(): PreferencesDuMenu {
  return useContext(Contexte) ?? REPLI;
}

