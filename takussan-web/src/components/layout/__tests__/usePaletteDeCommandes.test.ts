import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { autreDialogueOuvert, estLeRaccourciDeLaPalette, estSurApple, useRaccourciDeLaPalette } from '../usePaletteDeCommandes';

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

const UA_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const UA_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const sous = (ua: string) => vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua);

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('estLeRaccourciDeLaPalette', () => {
  it('ailleurs qu’Apple : Ctrl K, majuscule comprise ; ⌘ (la touche Windows) non', () => {
    expect(estLeRaccourciDeLaPalette(touche(), false)).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche({ key: 'K' }), false)).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche({ ctrlKey: false, metaKey: true }), false)).toBe(false);
  });

  it('revue M2 — sur Apple : ⌘K seul ; Ctrl K reste « couper jusqu’en fin de ligne » des champs', () => {
    expect(estLeRaccourciDeLaPalette(touche({ ctrlKey: false, metaKey: true }), true)).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche({ ctrlKey: false, metaKey: true, key: 'K' }), true)).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche(), true)).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ metaKey: true }), true)).toBe(false);
  });

  it('ni K seul, ni avec Alt ou Maj, ni répété, ni une autre touche', () => {
    expect(estLeRaccourciDeLaPalette(touche({ ctrlKey: false }), false)).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ altKey: true }), false)).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ shiftKey: true }), false)).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ repeat: true }), false)).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ key: 'j' }), false)).toBe(false);
  });

  it('un champ qui s’en sert l’a intercepté (`defaultPrevented`) : la palette s’efface', () => {
    expect(estLeRaccourciDeLaPalette(touche({ defaultPrevented: true }), false)).toBe(false);
  });

  it('estSurApple : macOS, iPhone, iPad ; pas Windows', () => {
    sous(UA_MAC);
    expect(estSurApple()).toBe(true);
    sous('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)');
    expect(estSurApple()).toBe(true);
    sous(UA_WINDOWS);
    expect(estSurApple()).toBe(false);
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
    expect(estLeRaccourciDeLaPalette(touche({ target: dedans }), false)).toBe(false);
    expect(estLeRaccourciDeLaPalette(touche({ target: fige }), false)).toBe(true);
    expect(estLeRaccourciDeLaPalette(touche({ target: champ }), false)).toBe(true);
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
    presser({ key: 'k', ctrlKey: true });
    expect(changer).toHaveBeenCalledWith(false);
  });

  it('revue M2 — sous macOS : ⌘K ouvre ; Ctrl K n’est ni pris ni annulé', () => {
    sous(UA_MAC);
    const changer = vi.fn();
    renderHook(() => useRaccourciDeLaPalette({ actif: true, ouverte: false, changer }));
    const ctrl = presser({ key: 'k', ctrlKey: true });
    expect(changer).not.toHaveBeenCalled();
    expect(ctrl.defaultPrevented).toBe(false);
    const cmd = presser({ key: 'k', metaKey: true });
    expect(changer).toHaveBeenCalledWith(true);
    expect(cmd.defaultPrevented).toBe(true);
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
