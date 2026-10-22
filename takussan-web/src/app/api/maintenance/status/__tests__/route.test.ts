// @vitest-environment node
/**
 * TCK-1221 (P79.06) — le relais du bandeau de maintenance ne lève pas sur une API sans réponse.
 *
 * Avant : `fetch` sans `catch`, la route levait, et le navigateur recevait la 500 de Next — au
 * moment précis où l'API ne répond plus. Il rend désormais la réponse de panne de `fetchVersApi`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));

import { GET } from '../route';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /api/maintenance/status', () => {
  it('rend 502 { code: upstream_unavailable } quand l\'API est injoignable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    const reponse = await GET();

    expect(reponse.status).toBe(502);
    expect(await reponse.json()).toEqual({ code: 'upstream_unavailable' });
  });

  it('relaie le statut de l\'API quand elle répond', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"data":{"active":false}}', { status: 200 }));

    const reponse = await GET();

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ data: { active: false } });
  });
});
