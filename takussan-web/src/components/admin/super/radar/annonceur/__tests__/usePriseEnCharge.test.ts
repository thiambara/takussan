import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RadarClaim } from '@/types/radar';
import { delaiDeRenouvellement, usePriseEnCharge } from '../usePriseEnCharge';

/**
 * TCK-2388 — le renouvellement de la prise en charge : planifié tant que la prise est à moi ET que la page est
 * visible, à mi-durée de ce qui reste ; jamais pour une prise à un autre, ni quand la page est masquée.
 */
const MAINTENANT = new Date('2026-10-28T10:00:00Z');
const MINUTE = 60_000;

const prise = (partiel: Partial<RadarClaim> = {}): RadarClaim => ({
  by: { id: 1, name: 'Awa Diop' },
  until: new Date(MAINTENANT.getTime() + 10 * MINUTE).toISOString(),
  mine: true,
  ...partiel,
});

function visibilite(etat: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => etat });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  visibilite('visible');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('delaiDeRenouvellement', () => {
  it('la moitié de ce qui reste', () => {
    expect(delaiDeRenouvellement(new Date(MAINTENANT.getTime() + 10 * MINUTE).toISOString(), MAINTENANT.getTime())).toBe(5 * MINUTE);
  });

  it('une prise échue, ou illisible, n\'a rien à renouveler', () => {
    expect(delaiDeRenouvellement(MAINTENANT.toISOString(), MAINTENANT.getTime())).toBeNull();
    expect(delaiDeRenouvellement('pas une date', MAINTENANT.getTime())).toBeNull();
  });

  it('une prise presque échue ne déclenche pas une rafale : un plancher d\'une seconde', () => {
    expect(delaiDeRenouvellement(new Date(MAINTENANT.getTime() + 200).toISOString(), MAINTENANT.getTime())).toBe(1_000);
  });
});

describe('usePriseEnCharge', () => {
  it('renouvelle à mi-durée de ce qui reste, pas avant', () => {
    const renouveler = vi.fn();
    renderHook(() => usePriseEnCharge({ claim: prise(), renouveler }));

    vi.advanceTimersByTime(5 * MINUTE - 1);
    expect(renouveler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(renouveler).toHaveBeenCalledTimes(1);
  });

  it('ne renouvelle pas une prise tenue par un autre', () => {
    const renouveler = vi.fn();
    renderHook(() => usePriseEnCharge({ claim: prise({ mine: false }), renouveler }));

    vi.advanceTimersByTime(20 * MINUTE);
    expect(renouveler).not.toHaveBeenCalled();
  });

  it('ne renouvelle rien quand personne ne tient l\'annonceur', () => {
    const renouveler = vi.fn();
    renderHook(() => usePriseEnCharge({ claim: null, renouveler }));

    vi.advanceTimersByTime(20 * MINUTE);
    expect(renouveler).not.toHaveBeenCalled();
  });

  it('ne planifie rien tant que la page est masquée', () => {
    visibilite('hidden');
    const renouveler = vi.fn();
    renderHook(() => usePriseEnCharge({ claim: prise(), renouveler }));

    vi.advanceTimersByTime(20 * MINUTE);
    expect(renouveler).not.toHaveBeenCalled();
  });

  it('masquer la page annule le renouvellement en attente, la montrer le rearme sur ce qui reste', () => {
    const renouveler = vi.fn();
    renderHook(() => usePriseEnCharge({ claim: prise(), renouveler }));

    vi.advanceTimersByTime(2 * MINUTE);
    visibilite('hidden');
    vi.advanceTimersByTime(8 * MINUTE);
    expect(renouveler).not.toHaveBeenCalled();

    // La prise expire à 10 min : revenue à 9, il en reste une, donc 30 s avant le renouvellement.
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 9 * MINUTE));
    visibilite('visible');
    vi.advanceTimersByTime(30_000 - 1);
    expect(renouveler).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(renouveler).toHaveBeenCalledTimes(1);
  });

  it('une prise échue pendant que la page était masquée ne se renouvelle pas', () => {
    const renouveler = vi.fn();
    renderHook(() => usePriseEnCharge({ claim: prise(), renouveler }));

    visibilite('hidden');
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 11 * MINUTE));
    visibilite('visible');
    vi.advanceTimersByTime(20 * MINUTE);
    expect(renouveler).not.toHaveBeenCalled();
  });

  it('la prise renouvelée (un nouveau `until`) replanifie, et le démontage annule tout', () => {
    const renouveler = vi.fn();
    const { rerender, unmount } = renderHook(({ claim }) => usePriseEnCharge({ claim, renouveler }), {
      initialProps: { claim: prise() },
    });

    vi.advanceTimersByTime(5 * MINUTE);
    expect(renouveler).toHaveBeenCalledTimes(1);

    // La fiche relue porte la prise prolongée : 10 min de plus à partir de maintenant.
    rerender({ claim: prise({ until: new Date(MAINTENANT.getTime() + 15 * MINUTE).toISOString() }) });
    vi.advanceTimersByTime(5 * MINUTE - 1);
    expect(renouveler).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(renouveler).toHaveBeenCalledTimes(2);

    unmount();
    vi.advanceTimersByTime(60 * MINUTE);
    expect(renouveler).toHaveBeenCalledTimes(2);
  });
});
