// @vitest-environment node
/**
 * TCK-1992 (P172.01) — le relais `GET /api/auth/me` ne rend 401 que sur un 401 de l'API.
 *
 * Mesuré le 2026-10-23 : toute exception de `getMe` devenait un 401 (API en 503, en 500, ou
 * injoignable), et `refreshUser` lisait ce 401 comme une session morte, puis déconnectait pour de
 * bon. Une `ApiError` garde son statut ; une panne sans réponse rend 503.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';

const getMeMock = vi.hoisted(() => vi.fn());
const cookiesPresents = vi.hoisted((): Record<string, string> => ({}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nom: string) => (nom in cookiesPresents ? { value: cookiesPresents[nom] } : undefined),
  }),
}));

vi.mock('@/lib/auth', () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
}));

const { GET } = await import('../route');

describe('GET /api/auth/me — statut de la panne (TCK-1992)', () => {
  beforeEach(() => {
    for (const nom of Object.keys(cookiesPresents)) delete cookiesPresents[nom];
    cookiesPresents.auth_token = 'jeton-A';
    getMeMock.mockReset();
  });

  it.each([503, 500, 403])('une ApiError %i de l’API garde son statut, jamais 401', async (status) => {
    getMeMock.mockRejectedValue(new ApiError(status, { message: 'x' }));

    const res = await GET();

    expect(res.status).toBe(status);
  });

  it('une API injoignable rend 503, pas 401', async () => {
    getMeMock.mockRejectedValue(new TypeError('fetch failed'));

    const res = await GET();

    expect(res.status).toBe(503);
  });

  it('un 401 de l’API reste un 401', async () => {
    getMeMock.mockRejectedValue(new ApiError(401, { message: 'Unauthenticated.' }));

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('sans cookie, 401 sans appeler l’API', async () => {
    delete cookiesPresents.auth_token;

    const res = await GET();

    expect(res.status).toBe(401);
    expect(getMeMock).not.toHaveBeenCalled();
  });
});
