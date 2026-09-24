import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { serialiserEtatBrouillon, useAutosaveBrouillon } from '../useAutosaveBrouillon';

/**
 * TCK-566 — la règle « un brouillon existe si et seulement si l'état diffère de
 * l'état vierge », éprouvée sans consommateur. Les parcours réels
 * (`WizardReprenable`, `UpgradeRequestForm`) ont leurs propres tests.
 */
describe('useAutosaveBrouillon — TCK-566', () => {
  it('l’ordre des clés n’est pas une différence de saisie', () => {
    expect(serialiserEtatBrouillon(0, { a: '', b: { c: 1, d: 2 } })).toBe(
      serialiserEtatBrouillon(0, { b: { d: 2, c: 1 }, a: '' }),
    );
    expect(serialiserEtatBrouillon(0, { a: '' })).not.toBe(serialiserEtatBrouillon(1, { a: '' }));
  });

  it('n’agit pas avant l’hydratation, même sur un état modifié', () => {
    const save = vi.fn();
    const clear = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useAutosaveBrouillon({
        hydrated: false,
        step: 0,
        data: { a: 'saisi' },
        etatVierge: serialiserEtatBrouillon(0, { a: '' }),
        brouillonServeurExiste: false,
        save,
        clear,
      }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it('état vierge sans brouillon : ni écriture ni suppression', () => {
    const save = vi.fn();
    const clear = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useAutosaveBrouillon({
        hydrated: true,
        step: 0,
        data: { a: '' },
        etatVierge: serialiserEtatBrouillon(0, { a: '' }),
        brouillonServeurExiste: false,
        save,
        clear,
      }),
    );
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(result.current.brouillonAttendu()).toBe(false);
  });

  it('avancer d’une étape sans rien taper EST une progression : elle s’écrit', () => {
    const save = vi.fn();
    const clear = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ step }: { step: number }) =>
        useAutosaveBrouillon({
          hydrated: true,
          step,
          data: { a: '' },
          etatVierge: serialiserEtatBrouillon(0, { a: '' }),
          brouillonServeurExiste: false,
          save,
          clear,
        }),
      { initialProps: { step: 0 } },
    );
    expect(save).not.toHaveBeenCalled();
    rerender({ step: 1 });
    expect(save).toHaveBeenCalledWith(1, { a: '' });
  });
});

describe('useAutosaveBrouillon — un brouillon relu n’est pas réécrit (TCK-566)', () => {
  const vierge = serialiserEtatBrouillon(0, { a: '' });

  it('ouvrir un brouillon réel ne le réécrit pas à l’identique', () => {
    const save = vi.fn();
    const clear = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ data }: { data: { a: string } }) =>
        useAutosaveBrouillon({
          hydrated: true,
          step: 1,
          data,
          etatVierge: vierge,
          brouillonServeurExiste: true,
          save,
          clear,
        }),
      { initialProps: { data: { a: 'repris' } } },
    );
    // Un nouvel objet de même contenu (re-rendu du parent) n'est pas une saisie.
    rerender({ data: { a: 'repris' } });
    expect(save).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(result.current.brouillonAttendu()).toBe(true);
  });

  it('taper puis revenir à l’état relu renvoie l’état relu (le débounce ne garde pas la frappe intermédiaire)', () => {
    const save = vi.fn();
    const clear = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ data }: { data: { a: string } }) =>
        useAutosaveBrouillon({
          hydrated: true,
          step: 0,
          data,
          etatVierge: vierge,
          brouillonServeurExiste: true,
          save,
          clear,
        }),
      { initialProps: { data: { a: 'repris' } } },
    );
    rerender({ data: { a: 'reprisX' } });
    rerender({ data: { a: 'repris' } });
    expect(save.mock.calls).toEqual([
      [0, { a: 'reprisX' }],
      [0, { a: 'repris' }],
    ]);
  });

  it('un brouillon relu puis ramené à l’état vierge est supprimé, puis une nouvelle saisie le recrée', () => {
    const save = vi.fn();
    const clear = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ data }: { data: { a: string } }) =>
        useAutosaveBrouillon({
          hydrated: true,
          step: 0,
          data,
          etatVierge: vierge,
          brouillonServeurExiste: true,
          save,
          clear,
        }),
      { initialProps: { data: { a: 'repris' } } },
    );
    rerender({ data: { a: '' } });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(result.current.brouillonAttendu()).toBe(false);
    rerender({ data: { a: 'b' } });
    expect(save).toHaveBeenCalledWith(0, { a: 'b' });
    expect(result.current.brouillonAttendu()).toBe(true);
  });
});
