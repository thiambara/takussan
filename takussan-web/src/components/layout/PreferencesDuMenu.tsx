'use client';

import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui/toast';
import { relaisImpersonationActif } from '@/lib/impersonation';
import type { IdDestination } from '@/lib/navigation/catalogue';
import { ecrireModeIcones, type ModeIcones } from '@/lib/navigation/mode-icones';
import type { Persona } from '@/lib/navigation/personas';
import {
  NAVIGATION_VIDE,
  avecPersona,
  epinglesApresBascule,
  lirePreferencesDeNavigation,
  prefsApresRepli,
  prefsDe,
  versLeCorps,
  type PreferencesDeNavigation,
  type PreferencesDuPersona,
} from '@/lib/navigation/preferences';

/** TCK-2480 (A4) — le délai avant l'envoi : plusieurs gestes rapprochés partent en UNE écriture. */
export const DELAI_D_ENVOI_MS = 800;

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

const Contexte = createContext<PreferencesDuMenu | null>(null);

export function usePreferencesDuMenu(): PreferencesDuMenu {
  return useContext(Contexte) ?? REPLI;
}

interface PreferencesDuMenuProviderProps {
  /** `user.preferences?.navigation`, tel que l'API le rend : lu par le schéma, jamais cru. */
  readonly navigationInitiale: unknown;
  readonly persona: Persona;
  /** Lu par le layout serveur sur le cookie `menu_icones` (tâche 6 : `getModeIconesDuMenu`). */
  readonly modeIconesInitial: ModeIcones;
  readonly children: ReactNode;
}

/**
 * TCK-2480 (ADR-0089 §6) — les préférences du menu de `/app`, tenues pour toute la coque : la barre fixe
 * et le tiroir (deux montages d'`AppSidebar`) et la section « Menu » du profil lisent le MÊME état.
 *
 * - Lecture : `user.preferences.navigation`, rendu par le serveur — la disposition personnelle est
 *   juste au premier octet.
 * - Écriture (A4) : optimiste ; la navigation ENTIÈRE part en `PATCH /api/me` (le relais BFF
 *   `src/app/api/me/route.ts`, même origine) 800 ms après le dernier geste — la clé est remplacée en
 *   bloc côté API. Un échec (HTTP ≠ 2xx ou réseau) rétablit le dernier état ACCEPTÉ et le dit ; un
 *   geste plus récent en attente suspend ce rétablissement (il porte l'état entier et sera jugé à son
 *   tour). Ce qui attend part au `pagehide` et au démontage (`keepalive`).
 * - Sous impersonation (A5), rien ne part : l'API refuserait, et l'opérateur ne modifie pas le compte
 *   qu'il observe. Les gestes restent dans l'onglet.
 * - Le mode icônes est un réglage de l'APPAREIL : un cookie, aucune écriture sur le compte.
 */
export function PreferencesDuMenuProvider({
  navigationInitiale,
  persona,
  modeIconesInitial,
  children,
}: PreferencesDuMenuProviderProps) {
  const t = useTranslations('nav.sidebar.preferences');
  const toast = useToast();
  const [navigation, setNavigation] = useState(() => lirePreferencesDeNavigation(navigationInitiale));
  const [modeIcones, setModeIcones] = useState(modeIconesInitial);
  /** Le dernier état que l'API a accepté (au départ : celui qu'elle a rendu). */
  const confirmee = useRef(navigation);
  /** L'état qu'aucune requête n'emporte encore. */
  const enAttente = useRef<PreferencesDeNavigation | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function envoyer(keepalive = false) {
    minuteur.current = null;
    const suivante = enAttente.current;
    enAttente.current = null;
    if (suivante === null) return;
    if (relaisImpersonationActif()) return;
    let ok = false;
    try {
      const reponse = await fetch('/api/me', {
        method: 'PATCH',
        credentials: 'include',
        keepalive,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ navigation: versLeCorps(suivante) }),
      });
      ok = reponse.ok;
    } catch {
      ok = false;
    }
    if (ok) {
      confirmee.current = suivante;
      return;
    }
    if (enAttente.current !== null) return;
    setNavigation(confirmee.current);
    toast.add({ title: t('echec'), type: 'error' });
  }

  function modifier(cible: Persona, changer: (p: PreferencesDuPersona) => PreferencesDuPersona) {
    // `enAttente` d'abord : deux gestes avant le rendu suivant composent sur le même état.
    const base = enAttente.current ?? navigation;
    const suivante = avecPersona(base, cible, changer(prefsDe(base, cible)));
    setNavigation(suivante);
    enAttente.current = suivante;
    if (minuteur.current !== null) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => void envoyer(), DELAI_D_ENVOI_MS);
  }

  // A4 — ce qui attend part tout de suite quand la page s'en va : `keepalive` laisse la requête
  // survivre au déchargement.
  const vider = useEffectEvent(() => {
    if (minuteur.current === null) return;
    clearTimeout(minuteur.current);
    void envoyer(true);
  });
  useEffect(() => {
    const surPagehide = () => vider();
    window.addEventListener('pagehide', surPagehide);
    return () => {
      window.removeEventListener('pagehide', surPagehide);
      vider();
    };
  }, []);

  const valeur: PreferencesDuMenu = {
    actif: true,
    persona,
    navigation,
    modeIcones,
    basculerEpingle: (cible, id, rendues) =>
      modifier(cible, (p) => ({ ...p, epingles: epinglesApresBascule(rendues, id) })),
    basculerRepli: (cible, groupe, replie, replieParDefaut) =>
      modifier(cible, (p) => prefsApresRepli(p, groupe, replie, replieParDefaut)),
    masquerDemarrer: (cible) => modifier(cible, (p) => ({ ...p, demarrer_masque: true })),
    reinitialiser: (cible) => modifier(cible, () => ({})),
    choisirModeIcones: (mode) => {
      setModeIcones(mode);
      ecrireModeIcones(mode);
    },
  };
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}
