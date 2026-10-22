import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-1223 (P103.02) — `apiRequest` ne pose `Content-Type` que lorsqu'un corps part.
 *
 * `application/json` n'est pas un type admis pour une requête CORS simple : posé sur un `GET` sans
 * corps, il faisait précéder chaque lecture du navigateur (référentiel public, autocomplétion de la
 * recherche) d'un `OPTIONS`. Environnement jsdom : c'est le navigateur qui paie le préflight.
 */

import { apiRequest } from '../api';

let fetchSpy: MockInstance<typeof fetch>;

function enTetesEnvoyes(): Headers {
  const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiRequest — Content-Type', () => {
  it('un GET sans corps part sans Content-Type', async () => {
    await apiRequest('/api/public/geo/cities');

    expect(enTetesEnvoyes().has('content-type')).toBe(false);
  });

  it('un POST à corps JSON garde Content-Type: application/json', async () => {
    await apiRequest('/api/favorites', { method: 'POST', body: { property_id: 1 } });

    expect(enTetesEnvoyes().get('content-type')).toBe('application/json');
  });
});
