'use client';

import { useEffect, useRef, type RefObject } from 'react';

import { estEditable, useFenetre } from '@/lib/fenetre';

/**
 * ADR-0133 (TCK-2988) — le mode saisie du formulaire plein écran, ce que le CSS ne peut pas faire seul :
 * passer d'un champ à l'autre, et amener le champ qui prend le focus à sa place.
 */

/** Les champs du corps, dans l'ordre du document : ceux qui ouvrent un clavier, et qui se voient. */
export function champsDuCorps(corps: HTMLElement): HTMLElement[] {
  return Array.from(corps.querySelectorAll<HTMLElement>('input, textarea, [contenteditable="true"]')).filter(
    (champ) => estEditable(champ) && champ.getClientRects().length > 0 && !champ.closest('[aria-hidden="true"], [inert]'),
  );
}

/**
 * ↑ ↓ : le champ précédent ou suivant, sans fermer le clavier (le bouton empêche son `pointerdown` : le focus ne
 * quitte jamais un champ). Au-delà du dernier, le clavier se ferme.
 */
export function naviguerEntreChamps(corps: HTMLElement | null, sens: 1 | -1) {
  if (!corps) return;
  const champs = champsDuCorps(corps);
  const actif = document.activeElement as HTMLElement | null;
  const i = actif ? champs.indexOf(actif) : -1;
  const suivant = i === -1 ? (sens === 1 ? champs[0] : champs.at(-1)) : champs[i + sens];
  if (suivant) suivant.focus({ preventScroll: true });
  else actif?.blur();
}

/** Le haut du bloc d'un champ : son libellé (`label[for]`) s'il est au-dessus, sinon le champ. */
function hautDuBloc(champ: HTMLElement): number {
  const haut = champ.getBoundingClientRect().top;
  const libelle = champ.id ? document.querySelector(`label[for="${CSS.escape(champ.id)}"]`) : null;
  return libelle ? Math.min(haut, libelle.getBoundingClientRect().top) : haut;
}

/** La marge sous l'en-tête du champ amené en tête du corps (12 px, sur l'échelle). */
const MARGE_EN_TETE = 12;

/**
 * Le champ qui prend le focus est amené à sa place une fois le superflu replié et le clavier monté : EN TÊTE du
 * corps s'il ouvre une liste (`role="combobox"` : toute la place restante est pour les suggestions), sinon juste
 * assez pour être visible. Trois passes (30, 280, 650 ms : le repli, puis le clavier d'iOS), puis une à chaque
 * changement de la fenêtre visible. Rend l'état de la saisie, lu par le même abonnement.
 */
export function useAmenerLeChamp(refCorps: RefObject<HTMLElement | null>): { readonly saisie: boolean } {
  const { saisie, vueH } = useFenetre();
  const cible = useRef<HTMLElement | null>(null);

  const placer = () => {
    const corps = refCorps.current;
    const champ = cible.current;
    if (!corps || !champ || document.activeElement !== champ || !corps.contains(champ)) return;
    if (!document.documentElement.dataset.saisie) return;
    const ecart = hautDuBloc(champ) - corps.getBoundingClientRect().top;
    if (champ.getAttribute('role') === 'combobox') {
      corps.scrollTo({ top: corps.scrollTop + ecart - MARGE_EN_TETE, behavior: 'smooth' });
    } else {
      champ.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  // `placer` change à chaque rendu : l'écouteur, posé une fois, lit la dernière version.
  const refPlacer = useRef(placer);
  useEffect(() => {
    refPlacer.current = placer;
  });

  useEffect(() => {
    const corps = refCorps.current;
    if (!corps) return;
    const passes: number[] = [];
    const surFocus = (evenement: FocusEvent) => {
      cible.current = evenement.target as HTMLElement;
      passes.forEach(clearTimeout);
      passes.length = 0;
      for (const ms of [30, 280, 650]) passes.push(window.setTimeout(() => refPlacer.current(), ms));
    };
    corps.addEventListener('focusin', surFocus);
    return () => {
      passes.forEach(clearTimeout);
      corps.removeEventListener('focusin', surFocus);
    };
  }, [refCorps]);

  // Le clavier a fini de monter (la fenêtre visible a changé), ou la saisie vient de commencer : on replace.
  useEffect(() => {
    refPlacer.current();
  }, [saisie, vueH]);

  return { saisie };
}
