'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * ADR-0133 (TCK-2988) — LA mesure de la fenêtre, une seule pour toute l'application.
 *
 * Un magasin de module, et non un fournisseur React : `WizardShell` est monté sous la coque d'entrée (`/publish`)
 * ET sous celle de l'application (`/app/properties/new`), qui n'ont aucun ancêtre commun où en poser un. Les
 * écouteurs se posent au premier abonné et se retirent au dernier.
 *
 * Sur iPhone (Safari, Chrome), le clavier ne réduit que la fenêtre VISUELLE ; sur Android, il réduit la fenêtre
 * de mise en page. Une formule couvre les deux :
 *
 *   caché = innerHeight − (visualViewport.offsetTop + visualViewport.height)
 *
 * Publié sur `<html>`, pour que la réponse soit en CSS (le variant `saisie:` de `globals.css`), sans re-rendu :
 *
 *   data-saisie="ouvert"   un champ éditable a le focus au toucher, ou un clavier est mesuré
 *   --vue-h, --vue-top     la fenêtre visible
 *   --clavier              ce que le clavier cache en bas (0 sans clavier, et sous Android)
 */

export interface EtatFenetre {
  /** Un champ éditable a le focus sur un pointeur grossier, ou un clavier est mesuré. */
  readonly saisie: boolean;
  /** Le clavier mesuré, en px : 0 en deçà du seuil (la barre d'adresse qui se replie n'est pas un clavier). */
  readonly clavier: number;
  /** Ce qui est caché en bas de la fenêtre de mise en page, en px, sans seuil (`useDecalageDuClavier`). */
  readonly cache: number;
  readonly vueH: number;
  readonly vueTop: number;
}

export const ETAT_SANS_MESURE: EtatFenetre = { saisie: false, clavier: 0, cache: 0, vueH: 0, vueTop: 0 };

/** Au-delà, c'est un clavier ; en deçà, la barre d'adresse qui se replie (relevé dans la maquette). */
export const SEUIL_CLAVIER = 120;

/** Le délai avant de déclarer la saisie finie : passer d'un champ à l'autre fait `focusout` PUIS `focusin`. */
export const DELAI_DE_SORTIE_MS = 80;

const TYPES_SANS_CLAVIER = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden']);

/** Un champ qui ouvre un clavier. */
export function estEditable(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    return !TYPES_SANS_CLAVIER.has(el.type) && !el.readOnly && !el.disabled && el.inputMode !== 'none';
  }
  return el.isContentEditable;
}

let etat: EtatFenetre = ETAT_SANS_MESURE;
const abonnes = new Set<() => void>();
let arreter: (() => void) | null = null;

function publier(suivant: EtatFenetre) {
  const racine = document.documentElement;
  racine.style.setProperty('--clavier', `${suivant.clavier}px`);
  racine.style.setProperty('--vue-h', `${Math.round(suivant.vueH)}px`);
  racine.style.setProperty('--vue-top', `${Math.round(suivant.vueTop)}px`);
  if (suivant.saisie) racine.dataset.saisie = 'ouvert';
  else delete racine.dataset.saisie;

  const avant = etat;
  if (
    avant.saisie === suivant.saisie &&
    avant.clavier === suivant.clavier &&
    avant.cache === suivant.cache &&
    Math.round(avant.vueH) === Math.round(suivant.vueH) &&
    Math.round(avant.vueTop) === Math.round(suivant.vueTop)
  ) {
    return;
  }
  etat = suivant;
  abonnes.forEach((rappel) => rappel());
}

function demarrer(): () => void {
  const vue = window.visualViewport;
  const tactile = window.matchMedia?.('(pointer: coarse)').matches === true;
  // La plus grande hauteur de mise en page vue sans champ actif : sous Android, c'est `innerHeight` qui baisse
  // quand le clavier s'ouvre.
  let innerMax = window.innerHeight;
  let sortie = 0;
  // Un clavier a-t-il été mesuré depuis que ce champ a le focus ? Le bouton qui rabaisse le clavier (Chrome iOS,
  // retour d'Android) le ferme SANS retirer le focus : sans ce témoin, le mode restait ouvert jusqu'au toucher
  // suivant (relevé sur l'iPhone du porteur, 2026-11-21).
  let clavierVu = false;

  // Synchrone, comme l'était `useDecalageDuClavier` : la mesure coûte quelques lectures, et le magasin ne prévient
  // ses abonnés que si une valeur change.
  const mesurer = () => {
    const innerH = window.innerHeight;
    const vueH = vue ? vue.height : innerH;
    const vueTop = vue ? vue.offsetTop : 0;
    const champ = estEditable(document.activeElement) ? document.activeElement : null;
    if (!champ) innerMax = Math.max(innerMax, innerH);
    const cache = Math.max(0, Math.round(innerH - (vueTop + vueH)));
    const clavierMesure = cache > SEUIL_CLAVIER || innerMax - innerH > SEUIL_CLAVIER;
    if (!champ) clavierVu = false;
    else if (clavierMesure) clavierVu = true;
    // Le clavier vu, puis plus mesuré, le champ gardant le focus : il a été rabaissé. Toucher le champ le rouvre,
    // la mesure le revoit, et la saisie reprend.
    const rabaisse = clavierVu && !clavierMesure;
    // Optimiste au toucher : le mode part AVEC le focus, pas quand le clavier a fini de monter — un seul
    // changement de mise en page au lieu de deux.
    publier({
      saisie: champ !== null && !rabaisse && (tactile || clavierMesure),
      clavier: cache > SEUIL_CLAVIER ? cache : 0,
      cache,
      vueH,
      vueTop,
    });
  };
  const surEntree = () => {
    window.clearTimeout(sortie);
    // Un champ touché repart optimiste : si le clavier est (resté) ouvert, la mesure le revoit aussitôt.
    clavierVu = false;
    mesurer();
  };
  const surSortie = () => {
    window.clearTimeout(sortie);
    sortie = window.setTimeout(mesurer, DELAI_DE_SORTIE_MS);
  };

  mesurer();
  vue?.addEventListener('resize', mesurer);
  vue?.addEventListener('scroll', mesurer);
  window.addEventListener('resize', mesurer);
  document.addEventListener('focusin', surEntree);
  document.addEventListener('focusout', surSortie);
  return () => {
    window.clearTimeout(sortie);
    vue?.removeEventListener('resize', mesurer);
    vue?.removeEventListener('scroll', mesurer);
    window.removeEventListener('resize', mesurer);
    document.removeEventListener('focusin', surEntree);
    document.removeEventListener('focusout', surSortie);
    const racine = document.documentElement;
    delete racine.dataset.saisie;
    racine.style.removeProperty('--clavier');
    racine.style.removeProperty('--vue-h');
    racine.style.removeProperty('--vue-top');
    etat = ETAT_SANS_MESURE;
  };
}

function abonner(rappel: () => void): () => void {
  abonnes.add(rappel);
  if (abonnes.size === 1) arreter = demarrer();
  return () => {
    abonnes.delete(rappel);
    if (abonnes.size === 0) {
      arreter?.();
      arreter = null;
    }
  };
}

/** L'état de la fenêtre. S'y abonner suffit à publier la mesure sur `<html>`. */
export function useFenetre(): EtatFenetre {
  return useSyncExternalStore(
    abonner,
    () => etat,
    () => ETAT_SANS_MESURE,
  );
}

/**
 * ADR-0133, amendement du 2026-11-22 (TCK-2995) — une surface superposée (feuille du bas, panneau plein écran,
 * dialogue de recherche, palette) s'abonne à LA mesure de la fenêtre tant qu'elle est montée : `<html>` porte alors
 * `data-saisie`, `--vue-h`, `--vue-top` et `--clavier` sur TOUTE route, y compris celles que la coque n'abonne pas
 * (`/app/messages`, le site public hors barre d'onglets). La réponse reste en CSS (le variant `saisie:`).
 *
 * Avec `corps` (le `data-slot` du corps qui défile) : le champ focalisé est ramené dans la vue, juste assez, à
 * chaque changement de la fenêtre visible — la feuille rétrécit quand le clavier monte, et le champ qu'on tape
 * pouvait se retrouver sous son bord bas (le geste de `CadreDeLaFeuille`, TCK-2988, rendu commun).
 *
 * Ne rend rien. À monter DANS le contenu de la surface : il n'existe que pendant son ouverture.
 */
export function SuiviDeLaFenetre({ corps }: { readonly corps?: string }): null {
  const { saisie, vueH } = useFenetre();
  useEffect(() => {
    if (!saisie || !corps) return;
    const champ = document.activeElement;
    if (champ instanceof HTMLElement && champ.closest(`[data-slot="${corps}"]`)) {
      champ.scrollIntoView?.({ block: 'nearest' });
    }
  }, [saisie, vueH, corps]);
  return null;
}
