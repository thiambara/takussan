// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

/**
 * TCK-1386 (P138.01) — côté serveur, seule `cache()` de React dédoublonne une lecture.
 *
 * La mémoïsation de `fetch` par Next range ses entrées par une clé qui contient TOUS les en-têtes
 * sauf `traceparent` et `tracestate` (`next/dist/server/lib/dedupe-fetch.js`, `generateCacheKey`).
 * `apiRequest` pose un `X-Request-Id` neuf sur chaque appel serveur (TCK-950) : deux lectures
 * identiques n'ont jamais la même clé, et partent deux fois. Rien ne l'écrivait.
 */

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next-intl/server', () => ({ getLocale: vi.fn(async () => 'fr') }));

import { apiRequest } from '../api';

let fetchSpy: MockInstance<typeof fetch>;

/** La clé de Next, restreinte aux en-têtes : le reste (méthode, mode…) est identique ici. */
function cleDeNext(appel: number): string {
  const init = fetchSpy.mock.calls[appel]?.[1] as RequestInit;
  const entetes = Object.entries(init.headers as Record<string, string>).filter(
    ([cle]) => !['traceparent', 'tracestate'].includes(cle.toLowerCase()),
  );
  return JSON.stringify([init.method ?? 'GET', entetes]);
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiRequest côté serveur — aucune déduplication par Next', () => {
  it('deux lectures identiques n’ont pas la même clé de mémoïsation : seul l’identifiant diffère', async () => {
    await apiRequest('/api/agencies/1', { token: 'jeton', activeProfileId: 'p:3' });
    await apiRequest('/api/agencies/1', { token: 'jeton', activeProfileId: 'p:3' });

    expect(cleDeNext(0)).not.toBe(cleDeNext(1));
    const sansId = (appel: number) => cleDeNext(appel).replace(/"X-Request-Id","[^"]+"/, '');
    expect(sansId(0)).toBe(sansId(1));
  });

  it('l’en-tête d’apiRequest l’écrit : la seule déduplication serveur est cache() de React', () => {
    const source = readFileSync(join(__dirname, '..', 'api.ts'), 'utf8');
    const debut = source.indexOf('export async function apiRequest<T>(');
    const enTete = source.slice(source.lastIndexOf('/**', debut), debut);

    expect(enTete).toContain('cache()');
    expect(enTete).toContain('X-Request-Id');
    expect(enTete).toContain('dedupe-fetch');
  });
});
