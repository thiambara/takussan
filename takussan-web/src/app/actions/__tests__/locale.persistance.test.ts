// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-655 (P06.01) — le choix de langue d'un visiteur connecté atteint son compte.
 *
 * `setLocaleAction` visait `PATCH /api/users/me`, une route absente, et un `catch {}` avalait
 * l'échec : `preferred_language` restait `fr`, et e-mails, SMS et notifications partaient en
 * français. Le test observe la requête réellement ENVOYÉE (`fetch` espionné, `apiRequest` réel).
 */
const cookiesPoses = vi.hoisted(() => [] as Array<[string, string]>);
let jeton: string | undefined;

vi.mock('next/headers', async () => {
  const { AUTH_COOKIE_NAME } = await import('@/lib/constants');
  return {
    headers: vi.fn(async () => new Headers()),
    cookies: vi.fn(async () => ({
      get: (nom: string) => (nom === AUTH_COOKIE_NAME && jeton ? { name: nom, value: jeton } : undefined),
      set: (nom: string, valeur: string) => {
        cookiesPoses.push([nom, valeur]);
      },
    })),
  };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next-intl/server', async () => ({
  ...(await import('@/test/intl')).mockTraductionsServeur(),
  getLocale: async () => 'fr',
}));

import { setLocaleAction } from '../locale';

describe('setLocaleAction — persistance sur le compte', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cookiesPoses.length = 0;
    jeton = undefined;
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () => new Response('{"data":{}}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('connecté : envoie la langue à PATCH /api/me', async () => {
    jeton = 'jeton-de-test';

    await setLocaleAction('wo');

    const appels = (fetchSpy.mock.calls as Array<[RequestInfo | URL, RequestInit | undefined]>).map(
      ([url, init]) => ({ url: String(url), init }),
    );
    expect(appels).toHaveLength(1);
    expect(new URL(appels[0]!.url).pathname).toBe('/api/me');
    expect(appels[0]!.init?.method).toBe('PATCH');
    expect(JSON.parse(String(appels[0]!.init?.body))).toEqual({ preferred_language: 'wo' });
    expect(cookiesPoses).toContainEqual(['NEXT_LOCALE', 'wo']);
  });

  it('anonyme : le cookie seul, aucun appel à l’API', async () => {
    await setLocaleAction('en');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cookiesPoses).toContainEqual(['NEXT_LOCALE', 'en']);
  });
});
