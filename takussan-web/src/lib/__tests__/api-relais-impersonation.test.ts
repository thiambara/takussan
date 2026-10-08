/**
 * TCK-600 (ADR-0055 §6) — pendant une session d'impersonation, le navigateur n'a AUCUN jeton :
 * `apiRequest` part au relais same-origin, sans le profil actif de l'opérateur (invariant 11).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '@/lib/api';

function reponse(): Response {
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
}

afterEach(() => {
  document.cookie = 'impersonation_active=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  vi.unstubAllGlobals();
});

describe('apiRequest — relais d\'impersonation', () => {
  it('avec le témoin de session : le relais, sans Authorization ni profil actif', async () => {
    document.cookie = 'impersonation_active=1; path=/';
    const fetchMock = vi.fn().mockResolvedValue(reponse());
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/properties?per_page=5', { activeProfileId: 'agency_admin:3', locale: 'fr' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/impersonation/proxy/properties?per_page=5');
    const enTetes = init.headers as Record<string, string>;
    expect(enTetes.Authorization).toBeUndefined();
    expect(enTetes['X-Active-Profile-Hint']).toBeUndefined();
  });

  it('sans témoin : l\'API, avec le jeton', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponse());
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/api/properties', { token: 'jeton', locale: 'fr' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https?:\/\/[^/]+\/api\/properties$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton');
  });
});
