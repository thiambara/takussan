'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ADR-0134 § 3 (TCK-2990) — l'en-tête et la barre d'onglets du téléphone s'effacent au défilement du DOCUMENT.
 *
 * Reprend la mécanique de la maquette « L'écran économe » validée par le porteur sur son iPhone :
 * - **un état, pas un suivi au doigt** : sur iOS, les défilements arrivent par à-coups et une barre qui suit le
 *   doigt tremble. Le crochet ne décide que « visibles » ou « effacées » ; le mouvement est une transition CSS
 *   (`globals.css`), jouée par le compositeur ;
 * - **hystérésis** : 40 px vers le bas pour effacer, 24 px vers le haut pour rappeler — un frémissement du pouce
 *   ne fait rien ;
 * - **départ automatique** : rappelées, les barres repartent 2,5 s après le dernier défilement. Jamais en haut ni
 *   en bas de page, jamais pendant qu'un doigt les touche ou que le clavier y navigue.
 *
 * Publié sur `<html>` (`data-barres-effacees`) : les portails et `--haut-colle` le lisent. Deux lecteurs : la coque
 * de `/app` (sous `md`) et la barre d'onglets du site public (sous `lg`) — jamais montés ensemble.
 */

export const SEUIL_EFFACER = 40;
export const SEUIL_RAPPELER = 24;
/** Le repos après lequel on arme le départ automatique : la fin d'un geste, pas une pause dans le geste. */
export const FIN_DE_DEFILEMENT_MS = 160;
export const DELAI_DE_DEPART_MS = 2500;

// `/app` (en-tête du téléphone, barre d'onglets) et le site public (sa `Navbar`, l'en-tête d'une page, sa barre).
const BARRES = [
  '[data-slot="en-tete-mobile"]',
  '[data-slot="barre-onglets"]',
  '[data-en-tete-au-telephone]',
  '[data-slot="en-tete-de-page"]',
  '[data-barre-onglets-publique]',
].join(', ');
/** Une barre d'action ou de sélection tient le bas : les barres ne s'effacent pas sous elle. */
const BARRE_D_ACTION = '#emplacement-barre-d-action > *';

/**
 * Le clavier navigue-t-il dans une barre ? Le focus seul ne suffit pas : à la fermeture du tiroir, d'une feuille ou
 * de la palette, base-ui RAMÈNE le focus sur le bouton qui l'a ouverte — « Menu » de la barre, recherche de
 * l'en-tête. Retenu tel quel, il gardait les barres pour toujours (relevé le 2026-11-21 sur l'iPhone du porteur :
 * « ça ne part pas au bout de 2,5 s »). Seul un focus VISIBLE (une navigation au clavier) les retient.
 */
function clavierDansUneBarre(): boolean {
  const actif = document.activeElement;
  if (!(actif instanceof Element) || actif.closest(BARRES) === null) return false;
  try {
    return actif.matches(':focus-visible');
  } catch {
    return true;
  }
}

export interface EffacementDesBarres {
  readonly effacees: boolean;
  /** La pastille : rappelle les barres, puis arme leur départ. */
  readonly rappeler: () => void;
}

/**
 * @param actif  sous `md`, en mode document, tiroir et palette fermés.
 * @param cle    la route : une navigation rend les barres.
 */
export function useEffacementDesBarres(actif: boolean, cle: string): EffacementDesBarres {
  const [effacees, setEffacees] = useState(false);
  const refRappeler = useRef<() => void>(() => {});

  useEffect(() => {
    const racine = document.documentElement;
    let cachees = false;
    let cumul = 0;
    let sensPrecedent = 0;
    let dernierY = window.scrollY;
    let minuterie = 0;
    let finDeDefilement = 0;
    let enContact = false;

    const enHaut = () => window.scrollY <= 8;
    const enBas = () => window.scrollY + window.innerHeight >= racine.scrollHeight - 4;
    const tenues = () => enContact || document.querySelector(BARRE_D_ACTION) !== null || clavierDansUneBarre();

    const montrer = () => {
      cachees = false;
      delete racine.dataset.barresEffacees;
      setEffacees(false);
    };
    const effacer = () => {
      if (tenues()) return;
      cachees = true;
      window.clearTimeout(minuterie);
      racine.dataset.barresEffacees = '';
      setEffacees(true);
    };
    /** Visibles, au repos, ni en haut ni en bas : elles repartent dans 2,5 s. */
    const armer = () => {
      window.clearTimeout(minuterie);
      if (!actif || cachees || enHaut() || enBas()) return;
      minuterie = window.setTimeout(() => {
        if (enHaut() || enBas()) return;
        // Retenues à l'échéance (un doigt, le clavier) : on reprend le compte, on ne l'abandonne pas.
        if (tenues()) armer();
        else effacer();
      }, DELAI_DE_DEPART_MS);
    };
    refRappeler.current = () => {
      montrer();
      armer();
    };

    montrer();
    if (!actif) return () => delete racine.dataset.barresEffacees;

    const surDefilement = () => {
      const y = window.scrollY;
      const d = y - dernierY;
      dernierY = y;
      // Un doigt qui fait défiler ne tient pas une barre : il la traverse (iOS ne rend pas toujours `pointercancel`).
      enContact = false;
      window.clearTimeout(minuterie);
      window.clearTimeout(finDeDefilement);
      finDeDefilement = window.setTimeout(armer, FIN_DE_DEFILEMENT_MS);

      if (enHaut() || enBas()) {
        cumul = 0;
        if (cachees) montrer();
        return;
      }
      if (Math.abs(d) < 1) return;
      const sens = Math.sign(d);
      if (sens !== sensPrecedent) {
        cumul = 0;
        sensPrecedent = sens;
      }
      cumul += Math.abs(d);
      if (sens > 0 && !cachees && cumul > SEUIL_EFFACER) effacer();
      else if (sens < 0 && cachees && cumul > SEUIL_RAPPELER) montrer();
    };

    // Un doigt sur une barre la retient ; relâché, le compte à rebours repart.
    const toucher = (evenement: PointerEvent) => {
      if (!(evenement.target instanceof Element) || !evenement.target.closest(BARRES)) return;
      enContact = true;
      window.clearTimeout(minuterie);
    };
    const lacher = () => {
      if (!enContact) return;
      enContact = false;
      armer();
    };
    // Le focus qui entre dans une barre effacée la rend : une barre déplacée par `transform` reste focalisable.
    const surFocus = (evenement: FocusEvent) => {
      if (cachees && evenement.target instanceof Element && evenement.target.closest(BARRES)) montrer();
    };

    window.addEventListener('scroll', surDefilement, { passive: true });
    window.addEventListener('pointerdown', toucher, { passive: true });
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', lacher);
    window.addEventListener('touchend', lacher, { passive: true });
    document.addEventListener('focusin', surFocus);
    return () => {
      window.clearTimeout(minuterie);
      window.clearTimeout(finDeDefilement);
      window.removeEventListener('scroll', surDefilement);
      window.removeEventListener('pointerdown', toucher);
      window.removeEventListener('pointerup', lacher);
      window.removeEventListener('pointercancel', lacher);
      window.removeEventListener('touchend', lacher);
      document.removeEventListener('focusin', surFocus);
      delete racine.dataset.barresEffacees;
    };
  }, [actif, cle]);

  return { effacees, rappeler: () => refRappeler.current() };
}
