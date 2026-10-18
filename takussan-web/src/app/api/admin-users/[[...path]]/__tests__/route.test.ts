// @vitest-environment node
/**
 * TCK-849 (P03.07) — le relais `admin-users` transmet le profil actif.
 *
 * Il ne relayait que `Authorization` : pour un admin de deux agences, `ResolveActiveProfile` ne
 * pouvait pas choisir l'agence, et `GET /api/users` rendait 403 — la console d'équipe lui était
 * fermée. Le relais pose désormais `X-Active-Profile-Hint`, comme `agencies`, sauf pendant une
 * impersonation (invariant 11 : le profil de l'opérateur n'est jamais transmis).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { GET } = await import('../route');

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ctx = { params: Promise.resolve({ path: [] as string[] }) };

function enTetesEnvoyes(): Record<string, string> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return init.headers as Record<string, string>;
}

describe('BFF /api/admin-users : profil actif', () => {
  it('relaie le profil actif du cookie en X-Active-Profile-Hint', async () => {
    const requete = new NextRequest('http://localhost/api/admin-users', {
      headers: { cookie: 'auth_token=1|abc; active_profile_id=agency_admin:42' },
    });
    await GET(requete, ctx);

    expect(enTetesEnvoyes()['X-Active-Profile-Hint']).toBe('agency_admin:42');
  });

  it("n'envoie aucun indice sans cookie de profil", async () => {
    const requete = new NextRequest('http://localhost/api/admin-users', { headers: { cookie: 'auth_token=1|abc' } });
    await GET(requete, ctx);

    expect(enTetesEnvoyes()).not.toHaveProperty('X-Active-Profile-Hint');
  });

  it("ne transmet pas le profil de l'opérateur pendant une impersonation", async () => {
    const requete = new NextRequest('http://localhost/api/admin-users', {
      headers: { cookie: 'auth_token=1|abc; impersonation_token=imp|xyz; active_profile_id=platform:1' },
    });
    await GET(requete, ctx);

    expect(enTetesEnvoyes()).not.toHaveProperty('X-Active-Profile-Hint');
    expect(enTetesEnvoyes().Authorization).toBe('Bearer imp|xyz');
  });
});
