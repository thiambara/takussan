import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-950 (P44.03) — dans le NAVIGATEUR, `apiRequest` n'envoie aucun `X-Request-Id` : l'identifiant
 * relie le journal du serveur Next à celui de l'API, et un en-tête de plus sur un appel
 * cross-origin obligerait l'API à l'autoriser en CORS.
 */

import { ApiError, apiRequest } from '../api';

let fetchSpy: MockInstance<typeof fetch>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response('{}', { status: 500, headers: { 'content-type': 'application/json' } }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiRequest dans le navigateur — pas de X-Request-Id', () => {
  it('n\'envoie pas l\'en-tête, et l\'erreur n\'en porte pas', async () => {
    expect(typeof window).toBe('object');

    const erreur = await apiRequest('/api/properties').catch((e: unknown) => e);

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(Object.keys((init?.headers ?? {}) as Record<string, string>)).not.toContain('X-Request-Id');
    expect((erreur as ApiError).requestId).toBeUndefined();
  });
});
