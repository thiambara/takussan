// @vitest-environment node

import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-950 (P44.03) — un `X-Request-Id` par appel SERVEUR d'`apiRequest`.
 *
 * L'API reprend un `X-Request-Id` entrant sûr et l'écrit dans chacun de ses journaux
 * (`ShareRequestLogContext`, TCK-774). Le front n'en envoyait aucun : une ligne `console.error` du
 * journal Next ne se reliait à aucune ligne de l'API. L'identifiant part à l'API, et l'`ApiError`
 * le porte, si bien que tout `console.error('[…]', err)` du front l'écrit.
 */

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next-intl/server', () => ({ getLocale: vi.fn(async () => 'fr') }));

import { ApiError, apiRequest } from '../api';

/** Le motif que l'API accepte (`ShareRequestLogContext::INCOMING_ID`) : au-delà, elle en tire un autre. */
const MOTIF_ACCEPTE_PAR_L_API = /^[A-Za-z0-9._-]{1,64}$/;

let fetchSpy: MockInstance<typeof fetch>;

function idEnvoye(appel: number): string | undefined {
  const init = fetchSpy.mock.calls[appel]?.[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.['X-Request-Id'];
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiRequest côté serveur — X-Request-Id', () => {
  it('envoie un identifiant que l\'API accepte, différent à chaque appel', async () => {
    await apiRequest('/api/properties');
    await apiRequest('/api/properties');

    const premier = idEnvoye(0);
    const second = idEnvoye(1);
    expect(premier).toMatch(MOTIF_ACCEPTE_PAR_L_API);
    expect(second).toMatch(MOTIF_ACCEPTE_PAR_L_API);
    expect(premier).not.toBe(second);
  });

  it('garde l\'identifiant que l\'appelant pose lui-même', async () => {
    await apiRequest('/api/properties', { headers: { 'X-Request-Id': 'pose-par-l-appelant' } });

    expect(idEnvoye(0)).toBe('pose-par-l-appelant');
  });

  it('l\'ApiError porte l\'identifiant envoyé, et un console.error de l\'erreur l\'écrit', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"message":"Server Error"}', { status: 500 }));

    const erreur = await apiRequest('/api/properties').catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ApiError);
    const id = idEnvoye(0);
    expect((erreur as ApiError).requestId).toBe(id);
    // `console.error('[…]', err)` passe par `util.inspect` sous Node : c'est ce qu'écrit le journal.
    expect(inspect(erreur)).toContain(String(id));
  });
});
