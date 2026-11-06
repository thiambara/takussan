'use client';

import { useEffect, useEffectEvent } from 'react';
import { retenirPage } from '@/lib/navigation/pages-recentes';

type ToucheDuRaccourci = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'repeat' | 'defaultPrevented' | 'target'
>;

/**
 * TCK-2482 (A6) — ⌘K (macOS) ou Ctrl K ouvre la palette.
 *
 * Relevé le 2026-11-05 : aucun champ de `/app` ne se sert de ce raccourci — aucun éditeur riche, aucun
 * `contenteditable` ; la recherche globale de la console (`GlobalSearch`, TCK-600) le prend dans une AUTRE
 * coque. La règle tient pour l'avenir SANS liste : un champ qui s'en sert l'intercepte et appelle
 * `preventDefault()`, et la palette s'efface devant `defaultPrevented` ; un `contenteditable` garde ses
 * raccourcis. Il marche depuis un champ de saisie ordinaire.
 */
export function estLeRaccourciDeLaPalette(e: ToucheDuRaccourci): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.repeat || e.defaultPrevented) return false;
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
    if (!estLeRaccourciDeLaPalette(event)) return;
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

/** TCK-2482 (A8) — la coque retient chaque page de `/app` visitée ; `null` : rien (plein écran). */
export function useRetenirLaPageRecente(compte: number, chemin: string | null): void {
  useEffect(() => {
    if (chemin !== null) retenirPage(compte, chemin);
  }, [compte, chemin]);
}
