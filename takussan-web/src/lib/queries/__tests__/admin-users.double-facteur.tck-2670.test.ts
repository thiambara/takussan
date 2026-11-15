import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchDoubleFacteurDeLEquipe } from '../admin-users';

/**
 * TCK-2670 (d1) — la ligne « N membres sur M ne l'ont pas encore activée » de la fiche de l'agence
 * compte le personnel en exercice, pas toute l'équipe : la double authentification que l'agence
 * exige ne vise jamais un bailleur (`TwoFactorRequirement`), ni un compte suspendu. Mesuré sur la
 * démo avant le correctif : « 24 membres sur 24 », pour 11 en exercice.
 */
function repondre(corps: unknown) {
  const espion = vi.fn(async (..._args: Parameters<typeof fetch>) => ({ ok: true, status: 200, json: async () => corps }));
  vi.stubGlobal('fetch', espion);
  return espion;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDoubleFacteurDeLEquipe', () => {
  it('ne lit que le personnel en exercice, ids seuls, une page de cent', async () => {
    const espion = repondre({ data: [], meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 } });

    await fetchDoubleFacteurDeLEquipe();

    const url = new URL(String(espion.mock.calls[0]?.[0]), 'http://localhost');
    expect(url.pathname).toBe('/api/admin-users');
    expect(url.searchParams.get('filter[assignable]')).toBe('1');
    expect(url.searchParams.get('fields[users]')).toBe('id');
    expect(url.searchParams.get('per_page')).toBe('100');
  });

  it('compte les membres dont le second facteur vaut false, jamais ceux où il manque', async () => {
    repondre({
      data: [{ id: 1, two_factor_enabled: false }, { id: 2, two_factor_enabled: true }, { id: 3, two_factor_enabled: false }, { id: 4 }],
      meta: { current_page: 1, last_page: 2, per_page: 100, total: 140 },
    });

    expect(await fetchDoubleFacteurDeLEquipe()).toEqual({ sans: 2, lus: 4, total: 140 });
  });
});
