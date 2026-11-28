import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { appelBff } from '@/lib/bff';
import { IMPERSONATION_MARKER_COOKIE } from '@/lib/impersonation';
import { poserProfilActifNavigateur } from '@/lib/profil-actif-navigateur';

/**
 * TCK-3009 — la primitive des appels du navigateur vers les route handlers du front (BFF).
 *
 * Ce qu'elle garde, et que les ~150 `fetch('/api/…')` recopiés tenaient chacun à leur façon : le chemin part
 * TEL QUEL (le relais `/api/super-admin/*` renomme vers `/admin` côté serveur, et garde le jeton de
 * l'opérateur pendant une impersonation — ADR-0055) ; aucun en-tête d'identité ; le cookie ; et un refus
 * levé en `ApiError(status, corps)`, la même que celle d'`apiRequest` (TCK-3008).
 */

function repondre(statut: number, corps?: unknown): Response {
  return new Response(corps === undefined ? null : JSON.stringify(corps), {
    status: statut,
    headers: corps === undefined ? undefined : { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function appel(): { url: string; init: RequestInit; enTetes: Headers } {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return { url, init, enTetes: new Headers(init.headers) };
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(repondre(200, { data: { id: 1 } }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = `${IMPERSONATION_MARKER_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  poserProfilActifNavigateur(null);
});

describe('appelBff — la requête', () => {
  it('une lecture : le chemin tel quel, le cookie, ni méthode ni corps', async () => {
    await expect(appelBff('/api/super-admin/plans')).resolves.toEqual({ data: { id: 1 } });
    const { url, init, enTetes } = appel();
    expect(url).toBe('/api/super-admin/plans');
    expect(init.credentials).toBe('include');
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
    expect(enTetes.get('Accept')).toBe('application/json');
    expect(enTetes.has('Content-Type')).toBe(false);
  });

  it('sérialise les paramètres par buildQueryString (sparse fieldsets, ADR-0006)', async () => {
    await appelBff('/api/super-admin/agencies', {
      params: { fields: { agencies: ['id', 'name'] }, filter: { status: 'active', search: '' }, sort: '-created_at', page: 2 },
    });
    const u = new URL(appel().url, 'http://front.test');
    expect(u.pathname).toBe('/api/super-admin/agencies');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      'fields[agencies]': 'id,name',
      'filter[status]': 'active',
      sort: '-created_at',
      page: '2',
    });
  });

  it('des paramètres sur un chemin qui porte déjà sa requête s’y ajoutent par `&`', async () => {
    await appelBff('/api/super-admin/credit-wallets/4?page=2', { params: { per_page: 10 } });
    expect(appel().url).toBe('/api/super-admin/credit-wallets/4?page=2&per_page=10');
  });

  it('des paramètres qui ne disent rien n’ajoutent pas de `?`', async () => {
    await appelBff('/api/me/profiles', { params: { filter: { status: undefined } } });
    expect(appel().url).toBe('/api/me/profiles');
  });

  it('un corps JSON part sérialisé, avec son Content-Type', async () => {
    await appelBff('/api/super-admin/plans', { method: 'POST', body: { code: 'pro' } });
    const { init, enTetes } = appel();
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"code":"pro"}');
    expect(enTetes.get('Content-Type')).toBe('application/json');
  });

  it('un FormData part tel quel, SANS Content-Type (le navigateur pose la frontière)', async () => {
    const donnees = new FormData();
    donnees.append('file', new Blob(['x']), 'x.jpg');
    await appelBff('/api/super-admin/geo/neighborhoods/3/cover', { method: 'POST', body: donnees });
    const { init, enTetes } = appel();
    expect(init.body).toBe(donnees);
    expect(enTetes.has('Content-Type')).toBe(false);
  });

  it('porte le signal, la clé d’idempotence, `cache` et `keepalive`', async () => {
    const arret = new AbortController();
    await appelBff('/api/me/welcome-seen', {
      method: 'POST',
      body: { key: 'a' },
      signal: arret.signal,
      cleIdempotence: 'cle-1',
      cache: 'no-store',
      keepalive: true,
    });
    const { init, enTetes } = appel();
    expect(init.signal).toBe(arret.signal);
    expect(enTetes.get('Idempotency-Key')).toBe('cle-1');
    expect(init.cache).toBe('no-store');
    expect(init.keepalive).toBe(true);
  });
});

describe('appelBff — l’identité ne part JAMAIS du navigateur (ADR-0055)', () => {
  it('pendant une impersonation, avec un profil actif posé : le chemin n’est pas détourné vers le relais, aucun en-tête d’identité', async () => {
    document.cookie = `${IMPERSONATION_MARKER_COOKIE}=1; path=/`;
    poserProfilActifNavigateur('agent:12');

    await appelBff('/api/super-admin/users/4');

    const { url, enTetes } = appel();
    // `apiRequest` détournerait vers `/api/impersonation/relay/…` : le relais de la console garde le jeton
    // de l'OPÉRATEUR, celui de l'impersonation n'y a rien à faire.
    expect(url).toBe('/api/super-admin/users/4');
    expect(enTetes.has('Authorization')).toBe(false);
    expect(enTetes.has('X-Active-Profile-Hint')).toBe(false);
    expect(enTetes.has('X-Profile-Id')).toBe(false);
    expect(enTetes.has('X-Request-Id')).toBe(false);
  });
});

describe('appelBff — la réponse', () => {
  it('un 204 sans corps rend `null`, comme `apiRequest` (l’ancien jsonOrThrow rejetait)', async () => {
    fetchMock.mockResolvedValue(repondre(204));
    await expect(appelBff('/api/super-admin/radar/advertisers/7/claim', { method: 'DELETE' })).resolves.toBeNull();
  });

  it('un refus lève une ApiError qui porte le statut, le corps, le code métier et ses paramètres (TCK-3008)', async () => {
    fetchMock.mockResolvedValue(repondre(409, { code: 'radar.claim.taken', params: { claimed_until: '2026-12-01' } }));
    const erreur = await appelBff('/api/super-admin/radar/advertisers/7/claim', { method: 'POST' }).catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ApiError);
    expect((erreur as ApiError).status).toBe(409);
    expect((erreur as ApiError).codeMetier).toBe('radar.claim.taken');
    expect((erreur as ApiError).params).toEqual({ claimed_until: '2026-12-01' });
  });

  it('un refus sans corps JSON lève une ApiError dont `data` vaut null', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    const erreur = await appelBff('/api/super-admin/plans').catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ApiError);
    expect((erreur as ApiError).status).toBe(502);
    expect((erreur as ApiError).data).toBeNull();
  });

  it('le code d’un relais du BFF se lit par `.code`', async () => {
    fetchMock.mockResolvedValue(repondre(401, { code: 'unauthenticated' }));
    const erreur = await appelBff('/api/super-admin/plans').catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ApiError);
    expect((erreur as ApiError).code).toBe('unauthenticated');
  });
});
