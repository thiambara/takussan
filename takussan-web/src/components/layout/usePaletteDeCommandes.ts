'use client';

import { useEffect, useEffectEvent } from 'react';
import { retenirPage } from '@/lib/navigation/pages-recentes';

type ToucheDuRaccourci = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'repeat' | 'defaultPrevented' | 'target'
>;

/**
 * TCK-2482 (A11) — une plateforme Apple (macOS, iPhone, iPad) : ⌘ y est la touche de commande. Lue au
 * client seulement ; la barre haute rend `Ctrl K` au serveur et corrige après l'hydratation
 * (`useSyncExternalStore`), sans écart.
 */
export function estSurApple(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/**
 * TCK-2482 (A6) — ⌘K sur Apple, Ctrl K ailleurs, ouvre la palette.
 *
 * Revue M2 — un seul modificateur par plateforme : sous macOS, Ctrl K est le « couper jusqu'en fin de
 * ligne » de tout champ (Cocoa) ; ailleurs, ⌘ est la touche Windows, que le système garde.
 *
 * Relevé le 2026-11-05 : aucun champ de `/app` ne se sert de ce raccourci — aucun éditeur riche, aucun
 * `contenteditable` ; la recherche globale de la console (`GlobalSearch`, TCK-600) le prend dans une AUTRE
 * coque. La règle tient pour l'avenir SANS liste : un champ qui s'en sert l'intercepte et appelle
 * `preventDefault()`, et la palette s'efface devant `defaultPrevented` ; un `contenteditable` garde ses
 * raccourcis. Il marche depuis un champ de saisie ordinaire.
 */
export function estLeRaccourciDeLaPalette(e: ToucheDuRaccourci, surApple: boolean): boolean {
  const modificateur = surApple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!modificateur || e.altKey || e.shiftKey || e.repeat || e.defaultPrevented) return false;
  if (e.key.toLowerCase() !== 'k') return false;
  const cible = e.target;
  return !(cible instanceof Element && cible.closest('[contenteditable]:not([contenteditable="false"])') !== null);
}

/**
 * Un autre dialogue est ouvert — le tiroir, un assistant d'accueil (`role="dialog"` + `data-open`, Base
 * UI) : la palette ne s'ouvre pas par-dessus. Deux modales empilées se disputent le focus.
 */
export function autreDialogueOuvert(racine: ParentNode = document): boolean {
  return racine.querySelector('[role="dialog"][data-open], [role="alertdialog"][data-open]') !== null;
}

interface RaccourciDeLaPalette {
  /** `false` en plein écran : le parcours porte sa propre sortie, le navigateur garde son raccourci. */
  readonly actif: boolean;
  readonly ouverte: boolean;
  readonly changer: (ouverte: boolean) => void;
}

export function useRaccourciDeLaPalette({ actif, ouverte, changer }: RaccourciDeLaPalette): void {
  const surTouche = useEffectEvent((event: KeyboardEvent) => {
    if (!estLeRaccourciDeLaPalette(event, estSurApple())) return;
    if (!ouverte && autreDialogueOuvert()) return;
    // Firefox, et Chrome sous Windows et Linux, y mettent leur propre recherche.
    event.preventDefault();
    changer(!ouverte);
  });
  useEffect(() => {
    if (!actif) return undefined;
    const ecouter = (event: KeyboardEvent) => surTouche(event);
    window.addEventListener('keydown', ecouter);
    return () => window.removeEventListener('keydown', ecouter);
  }, [actif]);
}

/** Le chemin → le `href` de l'entrée du menu qui le couvre, ou `null` (`resolveurDesRecents`). */
export type EntreeDuChemin = (chemin: string) => string | null;

/**
 * TCK-2482 (A8) — la coque retient chaque page de `/app` visitée ; `null` : rien (plein écran).
 *
 * TCK-2846 — seulement une page qui EST une entrée du menu (une liste, un tableau de bord : `entreeDe`
 * la rend à l'identique). Une fiche (`/app/properties/42`) est retenue par la fiche, sous son nom
 * (`RetenirLaFiche`) : retenue ici, elle redevenait « Biens ». Par espace : `espace` absent, rien.
 * `entreeDe` est lu au moment d'écrire, sans relancer l'effet : seule une NAVIGATION écrit.
 */
export function useRetenirLaPageRecente(
  compte: number,
  espace: string | null | undefined,
  chemin: string | null,
  entreeDe: EntreeDuChemin,
): void {
  const retenir = useEffectEvent((c: number, e: string | null | undefined, p: string) => {
    if (entreeDe(p) === p) retenirPage(c, e, p);
  });
  useEffect(() => {
    if (chemin !== null) retenir(compte, espace, chemin);
  }, [compte, espace, chemin]);
}
