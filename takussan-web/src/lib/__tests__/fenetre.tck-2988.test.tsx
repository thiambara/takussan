/**
 * ADR-0133 (TCK-2988) — la mesure unique de la fenêtre (`src/lib/fenetre.ts`) :
 *
 * - au toucher, le focus d'un champ éditable ouvre la saisie AVEC lui (`data-saisie="ouvert"` sur `<html>`) ;
 *   un bouton, une case, un champ en lecture seule, non ;
 * - au pointeur fin, seul un clavier mesuré (> 120 px cachés) l'ouvre ;
 * - la sortie attend 80 ms : passer d'un champ à l'autre ne referme rien ;
 * - `--vue-h`, `--vue-top` et `--clavier` suivent la fenêtre visible ;
 * - le dernier abonné parti, `<html>` est rendu propre.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';

import { useFenetre, type EtatFenetre } from '../fenetre';

let vue: EventTarget & { height: number; offsetTop: number };
const avantVue = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const avantMedia = window.matchMedia;

function pointeur(grossier: boolean) {
  window.matchMedia = ((requete: string) => ({
    matches: grossier && requete.includes('coarse'),
    media: requete,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

const releve: { dernier: EtatFenetre | null } = { dernier: null };
function Sonde() {
  const etat = useFenetre();
  useEffect(() => {
    releve.dernier = etat;
  });
  return (
    <div>
      <input aria-label="ville" />
      <input aria-label="quartier" />
      <input aria-label="lecture" readOnly />
      <input aria-label="case" type="checkbox" />
      <button type="button">bouton</button>
    </div>
  );
}

const racine = document.documentElement;
const champ = (nom: string) => document.querySelector(`[aria-label="${nom}"]`) as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  vue = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vue });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  pointeur(true);
});
afterEach(() => {
  vi.useRealTimers();
  if (avantVue) Object.defineProperty(window, 'visualViewport', avantVue);
  else delete (window as { visualViewport?: unknown }).visualViewport;
  window.matchMedia = avantMedia;
});

describe('ADR-0133 — la saisie', () => {
  it('au toucher, le focus d’un champ l’ouvre aussitôt ; la sortie attend 80 ms, et un autre champ la garde', () => {
    render(<Sonde />);
    expect(racine.dataset.saisie).toBeUndefined();

    act(() => champ('ville').focus());
    expect(racine.dataset.saisie).toBe('ouvert');
    expect(releve.dernier?.saisie).toBe(true);

    // D'un champ à l'autre : `focusout` puis `focusin`, rien ne se replie.
    act(() => champ('quartier').focus());
    act(() => void vi.advanceTimersByTime(200));
    expect(racine.dataset.saisie).toBe('ouvert');

    act(() => champ('quartier').blur());
    act(() => void vi.advanceTimersByTime(79));
    expect(racine.dataset.saisie).toBe('ouvert');
    act(() => void vi.advanceTimersByTime(1));
    expect(racine.dataset.saisie).toBeUndefined();
  });

  it('le clavier rabaissé sans quitter le champ (bouton de Chrome iOS) ferme la saisie ; rouvert, elle reprend', () => {
    render(<Sonde />);
    act(() => champ('ville').focus());
    expect(racine.dataset.saisie).toBe('ouvert');

    act(() => {
      vue.height = 844 - 336;
      vue.dispatchEvent(new Event('resize'));
    });
    expect(racine.dataset.saisie).toBe('ouvert');

    // Rabaissé : la fenêtre visible revient, le champ garde le focus.
    act(() => {
      vue.height = 844;
      vue.dispatchEvent(new Event('resize'));
    });
    expect(document.activeElement).toBe(champ('ville'));
    expect(racine.dataset.saisie).toBeUndefined();

    // Le champ touché de nouveau : le clavier remonte, la saisie reprend.
    act(() => {
      vue.height = 844 - 336;
      vue.dispatchEvent(new Event('resize'));
    });
    expect(racine.dataset.saisie).toBe('ouvert');

    // Rabaissé de nouveau, puis un AUTRE champ touché : il repart optimiste, comme au premier focus.
    act(() => {
      vue.height = 844;
      vue.dispatchEvent(new Event('resize'));
    });
    expect(racine.dataset.saisie).toBeUndefined();
    act(() => champ('quartier').focus());
    act(() => void vi.advanceTimersByTime(100));
    expect(racine.dataset.saisie).toBe('ouvert');
  });

  it('un bouton, une case, un champ en lecture seule n’ouvrent pas de clavier : pas de saisie', () => {
    render(<Sonde />);
    for (const nom of ['lecture', 'case']) {
      act(() => champ(nom).focus());
      expect(racine.dataset.saisie).toBeUndefined();
    }
    act(() => (document.querySelector('button') as HTMLElement).focus());
    expect(racine.dataset.saisie).toBeUndefined();
  });

  it('au pointeur fin, seul un clavier mesuré l’ouvre', () => {
    pointeur(false);
    render(<Sonde />);
    act(() => champ('ville').focus());
    expect(racine.dataset.saisie).toBeUndefined();

    act(() => {
      vue.height = 844 - 336;
      vue.dispatchEvent(new Event('resize'));
    });
    expect(racine.dataset.saisie).toBe('ouvert');
  });
});

describe('ADR-0133 — la fenêtre visible', () => {
  it('`--vue-h`, `--vue-top`, `--clavier` suivent le clavier ; la barre d’adresse (≤ 120 px) n’est pas un clavier', () => {
    render(<Sonde />);
    expect(racine.style.getPropertyValue('--vue-h')).toBe('844px');

    act(() => {
      vue.height = 844 - 336;
      vue.offsetTop = 120;
      vue.dispatchEvent(new Event('resize'));
    });
    expect(racine.style.getPropertyValue('--vue-h')).toBe('508px');
    expect(racine.style.getPropertyValue('--vue-top')).toBe('120px');
    expect(racine.style.getPropertyValue('--clavier')).toBe('216px');
    expect(releve.dernier?.cache).toBe(216);

    act(() => {
      vue.height = 844 - 80;
      vue.offsetTop = 0;
      vue.dispatchEvent(new Event('resize'));
    });
    expect(racine.style.getPropertyValue('--clavier')).toBe('0px');
    expect(releve.dernier?.cache).toBe(80);
  });

  it('le dernier abonné parti, `<html>` est rendu propre', () => {
    const vueMontee = render(<Sonde />);
    act(() => champ('ville').focus());
    expect(racine.dataset.saisie).toBe('ouvert');
    vueMontee.unmount();
    expect(racine.dataset.saisie).toBeUndefined();
    expect(racine.style.getPropertyValue('--vue-h')).toBe('');
  });
});
