'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { accesDepuis, contexteDeRepli, type AccesAdmin, type RepliAdmin } from './pages-admin';

/**
 * TCK-633 (lot B) — les pages `/admin/*` accessibles au profil actif, calculées UNE fois par le
 * layout serveur (`accesAdmin()`) et lues par les composants client qui montrent un lien vers
 * l'administration : `AdminSidebar`, `AdminShell`, `AppSidebar`, `UserMenu`, les raccourcis et les
 * états vides de l'accueil.
 *
 * La valeur est une liste de chemins et un booléen : sérialisable, elle traverse la frontière
 * serveur → client sans fonction ni icône.
 */
const Contexte = createContext<AccesAdmin | null>(null);

export function AccesAdminProvider({ acces, children }: { acces: AccesAdmin; children: ReactNode }) {
  return <Contexte.Provider value={acces}>{children}</Contexte.Provider>;
}

/** `null` quand aucun layout ne l'a fourni. */
export function useAccesAdmin(): AccesAdmin | null {
  return useContext(Contexte);
}

/**
 * La valeur fournie, ou — sans fournisseur (tests, coque montée ailleurs) — une dérivation
 * FAIL-CLOSED depuis ce que le composant sait déjà : rôles, agence, drapeau `standard`. Capacités
 * toujours inconnues dans ce repli : une page qui en exige une n'y figure jamais.
 */
export function useAccesAdminOuRepli(repli: RepliAdmin): AccesAdmin {
  const acces = useContext(Contexte);
  return acces ?? accesDepuis(contexteDeRepli(repli));
}
