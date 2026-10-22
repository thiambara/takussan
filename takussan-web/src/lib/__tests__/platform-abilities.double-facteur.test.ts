import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api';

/**
 * TCK-1203 — un 403 de second facteur n'est pas « pas d'opérateur » : il rend le code, que le
 * layout de la console transforme en demande de 2FA au lieu d'un renvoi vers `/app`.
 */
const apiRequestMock = vi.fn();
// `platform-abilities` importe `./api` : le double vise ce chemin-là.
vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

const { fetchPlatformAbilities } = await import('../platform-abilities');

beforeEach(() => {
  apiRequestMock.mockReset();
});

describe('fetchPlatformAbilities — refus de second facteur', () => {
  it.each(['two_factor_required', 'two_factor_step_up_required'] as const)('403 %s → le code', async (code) => {
    apiRequestMock.mockRejectedValue(new ApiError(403, { code }));
    expect(await fetchPlatformAbilities('jeton')).toEqual({ doubleFacteur: code });
  });

  it('403 sans code de second facteur → null, comme avant', async () => {
    apiRequestMock.mockRejectedValue(new ApiError(403, { code: 'auth.super_admin_required' }));
    expect(await fetchPlatformAbilities('jeton')).toBeNull();
  });
});
