/**
 * TCK-563 (M3) — le relais qui ouvre le clavier iOS dans le geste. Cf. l'en-tête du module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELAI_DE_GARDE_MS, ouvrirLeClavierDansLeGeste } from '../clavierDansLeGeste';

function relais(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[data-slot="relais-clavier"]');
}

describe('ouvrirLeClavierDansLeGeste', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('focalise SYNCHRONEMENT un champ texte en 16 px, fixe, invisible, hors tabulation et hors arbre d’accessibilité', () => {
    ouvrirLeClavierDansLeGeste();
    const champ = relais();
    expect(champ).not.toBeNull();
    expect(document.activeElement).toBe(champ);
    expect(champ!.type).toBe('text');
    expect(champ!.style.fontSize).toBe('16px');
    expect(champ!.style.position).toBe('fixed');
    expect(champ!.style.opacity).toBe('0');
    expect(champ!.tabIndex).toBe(-1);
    expect(champ).toHaveAttribute('aria-hidden', 'true');
  });

  // Vérification (mutation Ve) — seul le navigateur gardait « rien ne défile » : retirer
  // `preventScroll` restait vert. Le relais est ajouté en fin de <body> ; sans `preventScroll`, un
  // navigateur peut défiler jusqu'à lui (jsdom ne défile pas : on garde l'option passée).
  it('se focalise SANS défiler la page (`preventScroll`)', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    try {
      ouvrirLeClavierDansLeGeste();
      const appel = focus.mock.calls.find((_, i) => focus.mock.contexts[i] === relais());
      expect(appel).toBeDefined();
      expect(appel![0]).toEqual({ preventScroll: true });
    } finally {
      focus.mockRestore();
    }
  });

  it('disparaît dès que le vrai champ prend le focus', () => {
    const vrai = document.createElement('input');
    document.body.appendChild(vrai);
    ouvrirLeClavierDansLeGeste();
    expect(relais()).not.toBeNull();
    vrai.focus();
    expect(relais()).toBeNull();
    expect(document.activeElement).toBe(vrai);
  });

  it('personne ne prend le relais : il est rendu (clavier refermé) après le délai de garde', () => {
    ouvrirLeClavierDansLeGeste();
    vi.advanceTimersByTime(DELAI_DE_GARDE_MS - 1);
    expect(relais()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(relais()).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
