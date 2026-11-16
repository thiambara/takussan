/**
 * TCK-2934 (AC4) — de 1024 à 1279 px, l'étape du compte de `/publish` suit la disposition bureau (panneau dans la
 * colonne gauche, aperçu à droite) : la maquette `app-entree-publier` écrit « Bureau 1280 : inchangé à 1280 et à
 * 1024 ». Le régime se lit sur la colonne cible : celle du cadre d'entrée (`data-cadre-d-entree`) bascule dès `lg`,
 * celle de `/app/properties/new` garde 1280 (`xl`). `WizardShell` cache l'étape et montre la colonne au même seuil
 * (assertions de classes dans `PropertyWizard.panneau.tck-2601.test.tsx`).
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { REQUETE_DU_PANNEAU, REQUETE_DU_PANNEAU_D_ENTREE, usePanneauDeBureau } from '../CadreDeLaFeuille';

/** La largeur de la fenêtre, et les seules requêtes que le crochet pose. */
let largeur = 1440;
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    get matches() {
      if (query === REQUETE_DU_PANNEAU) return largeur >= 1280;
      if (query === REQUETE_DU_PANNEAU_D_ENTREE) return largeur >= 1024;
      return false;
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

function colonne(entree: boolean): HTMLElement {
  const noeud = document.createElement('div');
  if (entree) noeud.setAttribute('data-cadre-d-entree', '');
  return noeud;
}

const regime = (cible: HTMLElement | null) => renderHook(() => usePanneauDeBureau(cible)).result.current;

describe('usePanneauDeBureau — le seuil du panneau de compte', () => {
  it.each([1024, 1279, 1440])('/publish (cadre d’entrée) à %i px : le panneau', (l) => {
    largeur = l;
    expect(regime(colonne(true))).toBe(true);
  });

  it.each([768, 1023])('/publish à %i px : la feuille (ADR-0106 § 4)', (l) => {
    largeur = l;
    expect(regime(colonne(true))).toBe(false);
  });

  it.each([
    [1024, false],
    [1279, false],
    [1280, true],
  ])('/app/properties/new à %i px : inchangé (panneau dès 1280 seulement)', (l, attendu) => {
    largeur = l;
    expect(regime(colonne(false))).toBe(attendu);
  });

  it('sans colonne où se rendre, jamais le panneau', () => {
    largeur = 1440;
    expect(regime(null)).toBe(false);
  });
});
