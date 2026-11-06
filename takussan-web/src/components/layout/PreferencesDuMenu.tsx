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
  lirePreferencesDeNavigation,
  prefsApresEpingle,
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
 *   bloc côté API. UNE requête en vol à la fois (revue, I1) : un geste fait pendant le vol attend la
 *   réponse, puis part (après son délai). Un échec (HTTP ≠ 2xx ou réseau) rétablit le dernier état
 *   ACCEPTÉ et le dit ; un geste plus récent en attente suspend ce rétablissement (il porte l'état
 *   entier et sera jugé à son tour). L'état le plus récent non confirmé part au `pagehide` et au
 *   démontage (`keepalive`), même pendant un vol.
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
  // Revue de TCK-2480 (I1) — une écriture en vol à la fois. Chaque requête porte un numéro d'émission :
  // `confirmee` n'avance que sur une réponse plus RÉCENTE (dans l'ordre d'émission) que la dernière
  // acceptée, et l'échec ne se juge que lorsque plus rien ne vole ni n'attend.
  /** Requêtes parties et pas encore réglées : 0 ou 1, sauf un `keepalive` de départ (pagehide, démontage). */
  const enVol = useRef(0);
  /** Numéro de la dernière requête partie, et de la plus récente acceptée. */
  const emise = useRef(0);
  const acceptee = useRef(0);
  /** La dernière requête partie, tant qu'elle n'est pas réglée : `pagehide` la renvoie en `keepalive`. */
  const derniere = useRef<{ readonly numero: number; readonly etat: PreferencesDeNavigation; readonly keepalive: boolean } | null>(null);

  async function envoyer(etat: PreferencesDeNavigation, keepalive: boolean) {
    if (relaisImpersonationActif()) return;
    emise.current += 1;
    const numero = emise.current;
    enVol.current += 1;
    derniere.current = { numero, etat, keepalive };
    let ok = false;
    try {
      const reponse = await fetch('/api/me', {
        method: 'PATCH',
        credentials: 'include',
        keepalive,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ navigation: versLeCorps(etat) }),
      });
      ok = reponse.ok;
    } catch {
      ok = false;
    }
    enVol.current -= 1;
    if (derniere.current?.numero === numero) derniere.current = null;
    if (ok && numero > acceptee.current) {
      acceptee.current = numero;
      confirmee.current = etat;
    }
    juger();
  }

  /** L'état en attente part maintenant. */
  function envoyerLAttente(keepalive = false) {
    const etat = enAttente.current;
    enAttente.current = null;
    if (etat !== null) void envoyer(etat, keepalive);
  }

  /** À la réponse d'une requête : faire partir ce qui attend, ou juger la dernière émise. */
  function juger() {
    // Une requête plus récente vole encore : c'est elle qui sera jugée.
    if (enVol.current > 0) return;
    // Un geste attend (A4) : il porte l'état entier. Il part tout de suite si son délai est écoulé,
    // sinon à la fin de son délai ; c'est lui qui sera jugé.
    if (enAttente.current !== null) {
      if (minuteur.current === null) envoyerLAttente();
      return;
    }
    if (acceptee.current === emise.current) return;
    // La dernière requête émise est refusée : retour au dernier état ACCEPTÉ, et on le dit.
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
    minuteur.current = setTimeout(() => {
      minuteur.current = null;
      // En vol : la réponse le fera partir (`juger`), jamais deux écritures à la fois.
      if (enVol.current === 0) envoyerLAttente();
    }, DELAI_D_ENVOI_MS);
  }

  // A4 — quand la page s'en va, l'état le plus récent non confirmé part tout de suite, en `keepalive`
  // (qui laisse la requête survivre au déchargement), même si une requête est en vol : une requête
  // ordinaire meurt avec la page.
  const vider = useEffectEvent(() => {
    if (minuteur.current !== null) {
      clearTimeout(minuteur.current);
      minuteur.current = null;
    }
    if (enAttente.current !== null) {
      envoyerLAttente(true);
      return;
    }
    const enCours = derniere.current;
    if (enCours !== null && !enCours.keepalive) void envoyer(enCours.etat, true);
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
    basculerEpingle: (cible, id, rendues) => modifier(cible, (p) => prefsApresEpingle(p, rendues, id)),
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
