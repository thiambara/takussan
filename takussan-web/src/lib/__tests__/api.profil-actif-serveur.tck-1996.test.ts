// @vitest-environment node
/**
 * TCK-1996 (P174.02, P174.03) — `apiRequest` appelé CÔTÉ SERVEUR transmet le profil actif du
 * cookie en `X-Active-Profile-Hint`, sans que l'appelant ait à le passer.
 *
 * Mesuré le 2026-10-23 : les lectures et les écritures serveur de `/app` partaient avec le seul
 * jeton ; pour un agent de deux agences, l'API rendait une liste vide, une fiche en 403 et
 * refusait la création d'un bien (ses `ResolveActiveProfile` ne voient ni indice ni cookie, et
 * n'auto-basculent que pour une seule agence). Le repli suit celui de la langue (TCK-536) ;
 * `getActiveProfileId()` l'omet pendant une impersonation (TCK-600, invariant 11).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookiesPresents = vi.hoisted((): Record<string, string> => ({}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: (nom: string) => (nom in cookiesPresents ? { value: cookiesPresents[nom] } : undefined),
  })),
}));
vi.mock('next-intl/server', async () => ({
  ...(await import('@/test/intl')).mockTraductionsServeur(),
  getLocale: vi.fn(async () => 'fr'),
}));

import { apiRequest } from '../api';
import { createProperty } from '../queries/properties-server';

describe('apiRequest côté serveur — profil actif (TCK-1996)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const enTetes = (): Record<string, string> =>
    (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;

  beforeEach(() => {
    for (const nom of Object.keys(cookiesPresents)) delete cookiesPresents[nom];
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"data":{}}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pose l’indice du cookie quand l’appelant n’en passe aucun', async () => {
    cookiesPresents.active_profile_id = 'agent:5';

    await apiRequest('/api/properties', { token: 'jeton' });

    expect(enTetes()['X-Active-Profile-Hint']).toBe('agent:5');
  });

  it('une écriture d’action serveur (createProperty) part avec l’indice', async () => {
    cookiesPresents.active_profile_id = 'agent:5';

    await createProperty('jeton', { title: 'T' } as unknown as Parameters<typeof createProperty>[1]);

    expect(enTetes()['X-Active-Profile-Hint']).toBe('agent:5');
  });

  it('pendant une impersonation, aucun indice', async () => {
    cookiesPresents.active_profile_id = 'agent:5';
    cookiesPresents.impersonation_token = 'jeton-cible';

    await apiRequest('/api/properties', { token: 'jeton-cible' });

    expect(enTetes()['X-Active-Profile-Hint']).toBeUndefined();
  });

  it('le profil passé par l’appelant l’emporte', async () => {
    cookiesPresents.active_profile_id = 'agent:5';

    await apiRequest('/api/properties', { token: 'jeton', activeProfileId: 'owner:9' });

    expect(enTetes()['X-Active-Profile-Hint']).toBe('owner:9');
  });

  it('un X-Profile-Id explicite n’est pas doublé d’un indice', async () => {
    cookiesPresents.active_profile_id = 'agent:5';

    await apiRequest('/api/properties', { token: 'jeton', headers: { 'X-Profile-Id': 'owner:9' } });

    expect(enTetes()['X-Active-Profile-Hint']).toBeUndefined();
    expect(enTetes()['X-Profile-Id']).toBe('owner:9');
  });

  it('sans cookie de profil, aucun indice', async () => {
    await apiRequest('/api/properties', { token: 'jeton' });

    expect(enTetes()['X-Active-Profile-Hint']).toBeUndefined();
  });

  it('sans jeton, aucun indice', async () => {
    cookiesPresents.active_profile_id = 'agent:5';

    await apiRequest('/api/public/properties');

    expect(enTetes()['X-Active-Profile-Hint']).toBeUndefined();
  });
});
