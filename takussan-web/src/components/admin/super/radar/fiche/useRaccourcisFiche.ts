'use client';

import { useEffect } from 'react';

import { dialogueOuvert, estZoneDeSaisie } from './gestes';

interface Raccourcis {
  readonly valider: () => void;
  readonly doublon: () => void;
  readonly ecarter: () => void;
}

/**
 * TCK-2387 — les raccourcis de la fiche.
 *
 * - `⌘/Ctrl + Entrée` valide, même depuis un champ : c'est le geste de qui vient de taper ;
 * - `D` (doublon) et `E` (écarter) ne partent PAS d'une zone de saisie — champ, zone de texte, liste
 *   déroulante, contenu éditable — ni avec une touche de modification, ni en répétition ;
 * - un dialogue modal ouvert garde tous les raccourcis : la fiche derrière ne réagit pas ;
 * - une touche maintenue n'envoie qu'une fois (`⌘/Ctrl + Entrée` compris).
 */
export function useRaccourcisFiche({ valider, doublon, ecarter }: Raccourcis) {
  useEffect(() => {
    const surTouche = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (dialogueOuvert(event.target)) return;

      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        // Une touche maintenue répète le keydown : un seul envoi.
        if (!event.repeat) valider();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      const touche = event.key.toLowerCase();
      if (touche !== 'd' && touche !== 'e') return;
      if (estZoneDeSaisie(event.target)) return;
      event.preventDefault();
      if (touche === 'd') doublon();
      else ecarter();
    };

    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [valider, doublon, ecarter]);
}
