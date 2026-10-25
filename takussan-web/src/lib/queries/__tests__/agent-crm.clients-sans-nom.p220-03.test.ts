import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P220.03 (TCK-2281) — une fiche client née d'un compte créé par téléphone garde prénom et nom
 * vides. Décision du porteur : chaque écran la nomme par `nomAffichable()` (e-mail, numéro, `#<id>`),
 * avec les seuls champs qu'il charge déjà ; avant, il composait une chaîne vide.
 *
 * `searchTaskables` ne demande que `id`, `first_name` et `last_name` : une fiche sans nom
 * retombe sur `#<id>` (son libellé valait `' '`).
 */
const apiRequest = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { searchTaskables } = await import('../agent-crm');

describe('searchTaskables — fiche client sans nom (P220.03)', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ data: [{ id: 12, first_name: '', last_name: '' }, { id: 13, first_name: 'Awa', last_name: 'Sarr' }] });
  });

  it('retombe sur #<id>, et garde le nom connu', async () => {
    expect(await searchTaskables('jeton', 'customer', 'a')).toEqual([
      { id: 12, label: '#12' },
      { id: 13, label: 'Awa Sarr' },
    ]);
    expect(decodeURIComponent(String(apiRequest.mock.calls[0]?.[0]))).toContain('fields[customers]=id,first_name,last_name');
  });
});
