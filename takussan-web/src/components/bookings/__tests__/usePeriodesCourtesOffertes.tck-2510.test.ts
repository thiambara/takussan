import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { oublierLesPeriodesCourtes, periodesAProposer, usePeriodesCourtesOffertes } from '../usePeriodesCourtesOffertes';

/**
 * TCK-2510 — « Journalier » et « Hebdo » ne s'affichent dans le filtre de la liste que s'ils ont
 * des biens à montrer. Le compte vient de `GET /api/public/properties/search` (`meta.total`).
 */
const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ apiFetch }));

const TOUTES = ['daily', 'weekly', 'monthly', 'yearly'] as const;

beforeEach(() => {
  apiFetch.mockReset();
  oublierLesPeriodesCourtes();
});

describe('usePeriodesCourtesOffertes (TCK-2510)', () => {
  it('sonde chaque période courte par la recherche publique, et ne garde que celles qui ont un bien', async () => {
    apiFetch.mockImplementation(async (chemin: string) => ({ meta: { total: chemin.includes('rent_period=weekly') ? 3 : 0 } }));
    const { result } = renderHook(() => usePeriodesCourtesOffertes(true));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect([...result.current!]).toEqual(['weekly']);
    expect(apiFetch).toHaveBeenCalledWith('/public/properties/search?contract_type=rent&rent_period=daily&per_page=1');
    expect(apiFetch).toHaveBeenCalledWith('/public/properties/search?contract_type=rent&rent_period=weekly&per_page=1');
  });

  it('inactif (pas en location), aucune sonde', () => {
    const { result } = renderHook(() => usePeriodesCourtesOffertes(false));
    expect(result.current).toBeNull();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('une sonde en échec garde l’option : on ne cache pas un filtre qui marche', async () => {
    apiFetch.mockRejectedValue(new Error('réseau'));
    const { result } = renderHook(() => usePeriodesCourtesOffertes(true));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect([...result.current!].sort()).toEqual(['daily', 'weekly']);
  });
});

describe('periodesAProposer (TCK-2510)', () => {
  it('sans bien à la nuit ni à la semaine, seules les périodes longues restent', () => {
    expect(periodesAProposer(TOUTES, new Set(), undefined)).toEqual(['monthly', 'yearly']);
  });

  it('une période courte avec des biens reste', () => {
    expect(periodesAProposer(TOUTES, new Set(['daily'] as const), undefined)).toEqual(['daily', 'monthly', 'yearly']);
  });

  it('la valeur choisie reste, même sans bien : elle doit pouvoir se retirer', () => {
    expect(periodesAProposer(TOUTES, new Set(), 'weekly')).toEqual(['weekly', 'monthly', 'yearly']);
  });

  it('pas encore lu : toutes les options', () => {
    expect(periodesAProposer(TOUTES, null, undefined)).toEqual([...TOUTES]);
  });
});
