'use client';

import { useEffect, useRef } from 'react';

/** Les touches de la boîte au bureau : J suivante, K précédente, V visite, T traiter. */
export type ToucheDeLaBoite = 'j' | 'k' | 'v' | 't';

const CHAMP = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]';
/** Une surface ouverte par-dessus la boîte : dialogue, feuille, menu, popover. Le toast n'en est pas une. */
const SURFACE = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/** Une surface ouverte AILLEURS que dans le toast (base-ui donne au toast le rôle `dialog`). */
function surfaceOuverte(): boolean {
  return Array.from(document.querySelectorAll(SURFACE)).some((el) => !el.closest('[data-slot="toaster"]'));
}

/**
 * Faut-il laisser passer cette frappe ? Oui dès qu'elle porte un modificateur (Ctrl, ⌘, Alt), qu'elle
 * se répète (une touche tenue ne traite pas dix demandes), que le focus est dans un champ ou qu'une
 * surface est ouverte : un raccourci sans modificateur ne vole jamais une saisie.
 */
export function frappeIgnoree(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return true;
  const cible = e.target instanceof Element ? e.target : null;
  if (cible && (cible.closest(CHAMP) || (cible instanceof HTMLElement && cible.isContentEditable))) return true;
  return surfaceOuverte();
}

/**
 * TCK-2885 — les raccourcis de la boîte du bureau (maquette `app-fil-commercial` a-0 : « J K
 * parcourir · V visite · T traiter »). Un seul écouteur sur le document, actif au bureau seulement ;
 * les gestes lus au moment de la frappe (une référence, pas une dépendance de l'effet).
 */
export function useRaccourcisDeLaBoite(actif: boolean, gestes: Readonly<Record<ToucheDeLaBoite, () => void>>) {
  const courant = useRef(gestes);
  useEffect(() => {
    courant.current = gestes;
  });
  useEffect(() => {
    if (!actif) return;
    const surTouche = (e: KeyboardEvent) => {
      const touche = e.key.toLowerCase();
      if (touche !== 'j' && touche !== 'k' && touche !== 'v' && touche !== 't') return;
      if (e.shiftKey || frappeIgnoree(e)) return;
      e.preventDefault();
      courant.current[touche]();
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [actif]);
}
