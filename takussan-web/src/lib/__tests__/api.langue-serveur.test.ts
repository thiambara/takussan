// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-536 — `apiRequest` appelé CÔTÉ SERVEUR transmet la langue de la requête en
 * `Accept-Language`, sans que l'appelant ait à la passer.
 *
 * `apiRequest` ne lisait la langue que dans `document.cookie` : depuis une action serveur, rien ne
 * partait, et Laravel répondait dans `APP_LOCALE` (`en` en local). Relevé sur :8002 le 2026-09-17 :
 * `POST /api/auth/login {}` rend « The email field is required. » sans en-tête, « Le champ email
 * est obligatoire. » avec `Accept-Language: fr`. Les 19 modules de `src/app/actions/` passent tous
 * par `apiRequest` via `src/lib/*` ; un seul (`property.ts`) passait la langue lui-même.
 *
 * L'environnement est `node` : sous jsdom, `window` existe et le chemin serveur n'est jamais pris.
 */
const getLocaleMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next-intl/server', async () => ({
  ...(await import('@/test/intl')).mockTraductionsServeur(),
  getLocale: getLocaleMock,
}));

import { apiRequest } from '../api';
import { twoFactorEnable } from '../security';

describe('apiRequest côté serveur — Accept-Language', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const enTeteEnvoye = (): string | undefined => {
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    return (init.headers as Record<string, string>)['Accept-Language'];
  };

  beforeEach(() => {
    getLocaleMock.mockReset();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"data":{}}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('transmet la langue next-intl de la requête quand l’appelant n’en passe aucune', async () => {
    getLocaleMock.mockResolvedValue('wo');

    await apiRequest('/api/test');

    expect(enTeteEnvoye()).toBe('wo');
  });

  it('un module de src/lib appelé par une action serveur en hérite, sans rien passer', async () => {
    getLocaleMock.mockResolvedValue('en');

    await twoFactorEnable('jeton');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/two-factor/enable'),
      expect.anything(),
    );
    expect(enTeteEnvoye()).toBe('en');
  });

  it('une langue passée explicitement l’emporte sur celle de la requête', async () => {
    getLocaleMock.mockResolvedValue('wo');

    await apiRequest('/api/test', { locale: 'fr' });

    expect(enTeteEnvoye()).toBe('fr');
  });

  it('hors d’une requête (getLocale lève), la requête part quand même, sans langue', async () => {
    getLocaleMock.mockRejectedValue(new Error('outside request scope'));

    await apiRequest('/api/test');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(enTeteEnvoye()).toBeUndefined();
  });

  it('une langue non supportée n’est pas transmise', async () => {
    getLocaleMock.mockResolvedValue('de');

    await apiRequest('/api/test');

    expect(enTeteEnvoye()).toBeUndefined();
  });
});
