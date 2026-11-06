import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { autreDialogueOuvert, estLeRaccourciDeLaPalette, useRaccourciDeLaPalette } from '../usePaletteDeCommandes';

/** TCK-2482 (A6) — les règles du raccourci, une par une. */
const touche = (o: Partial<Parameters<typeof estLeRaccourciDeLaPalette>[0]> = {}) => ({
  key: 'k', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false, repeat: false, defaultPrevented: false,
  target: document.body as EventTarget | null, ...o,
});
const presser = (init: KeyboardEventInit) => {
  const ev = new KeyboardEvent('keydown', { cancelable: true, ...init });
  window.dispatchEvent(ev);
  return ev;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('estLeRaccourciDeLaPalette', () => {
  it('Ctrl K et ⌘K, majuscule comprise', () => {
    expect(estLeRaccourciDeLaPalette(touche())).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche({ ctrlKey: false, metaKey: true }))).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche({ key: 'K' }))).toBe(true);
  });

  it('ni K seul, ni avec Alt ou Maj, ni répété, ni une autre touche', () => {
    expect(estLeRaccourciDeLaPalette(touche({ ctrlKey: false }))).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ altKey: true }))).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ shiftKey: true }))).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ repeat: true }))).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ key: 'j' }))).toBe(false);
  });

  it('un champ qui s’en sert l’a intercepté (`defaultPrevented`) : la palette s’efface', () => {
    expect(estLeRaccourciDeLaPalette(touche({ defaultPrevented: true }))).toBe(false);
  });

  it('dans un `contenteditable` : non ; dans `contenteditable="false"` ou un champ de saisie : oui', () => {
    const editeur = document.createElement('div');
    editeur.setAttribute('contenteditable', '');
    const dedans = document.createElement('span');
    editeur.append(dedans);
    const fige = document.createElement('div');
    fige.setAttribute('contenteditable', 'false');
    const champ = document.createElement('input');
    document.body.append(editeur, fige, champ);
    expect(estLeRaccourciDeLaPalette(touche({ target: dedans }))).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ target: fige }))).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche({ target: champ }))).toBe(true);
  });
});

describe('useRaccourciDeLaPalette', () => {
  it('ouvre, et prive le navigateur de son propre Ctrl K', () => {
    const changer = vi.fn();
    renderHook(() => useRaccourciDeLaPalette({ actif: true, ouverte: false, changer }));
    const ev = presser({ key: 'k', ctrlKey: true });
    expect(changer).toHaveBeenCalledWith(true);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('palette ouverte, le même raccourci la referme', () => {
    const changer = vi.fn();
    renderHook(() => useRaccourciDeLaPalette({ actif: true, ouverte: true, changer }));
    presser({ key: 'k', metaKey: true });
    expect(changer).toHaveBeenCalledWith(false);
  });

  it('ne s’ouvre pas par-dessus un autre dialogue ouvert, mais se referme toujours', () => {
    const autre = document.createElement('div');
    autre.setAttribute('role', 'dialog');
    autre.setAttribute('data-open', '');
    document.body.append(autre);
    expect(autreDialogueOuvert()).toBe(true);
    const changer = vi.fn();
    const { rerender } = renderHook((p: { ouverte: boolean }) => useRaccourciDeLaPalette({ actif: true, ouverte: p.ouverte, changer }), {
      initialProps: { ouverte: false },
    });
    const ev = presser({ key: 'k', ctrlKey: true });
    expect(changer).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
    rerender({ ouverte: true });
    presser({ key: 'k', ctrlKey: true });
    expect(changer).toHaveBeenCalledWith(false);
  });

  it('inactif (plein écran) : rien, et le navigateur garde son raccourci', () => {
    const changer = vi.fn();
    renderHook(() => useRaccourciDeLaPalette({ actif: false, ouverte: false, changer }));
    const ev = presser({ key: 'k', ctrlKey: true });
    expect(changer).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
});
