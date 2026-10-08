// @vitest-environment node
/**
 * TCK-600 (ADR-0055 §6) — AC5d : aucun jeton d'impersonation n'atteint la page.
 *
 * Les route handlers sont EXÉCUTÉS contre un `fetch` substitué : ce qui est éprouvé, c'est la
 * réponse que le navigateur recevrait — son corps et ses `Set-Cookie`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { POST as demarrer } from '../start/route';
import { POST as terminer } from '../stop/route';
import { GET as courante } from '../current/route';
import { GET as relaiGet, POST as relaiPost } from '../proxy/[...path]/route';
import { POST as consolePost } from '../../super-admin/[...path]/route';

const JETON = '42|jeton-impersonation-secret';

function requete(url: string, cookies: Record<string, string>, init: RequestInit = {}): NextRequest {
  const enTetes = new Headers(init.headers);
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  if (cookie) enTetes.set('cookie', cookie);
  return new NextRequest(new URL(url, 'http://localhost:3113'), { ...init, headers: enTetes } as never);
}

function cookiePose(res: Response, nom: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${nom}=`));
}

function efface(res: Response, nom: string): boolean {
  const c = cookiePose(res, nom);
  return c !== undefined && (/max-age=0/i.test(c) || /expires=Thu, 01 Jan 1970/i.test(c));
}

function reponseApi(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/impersonation/start', () => {
  it('pose le jeton dans un cookie httpOnly SameSite=Strict et ne le rend JAMAIS au navigateur', async () => {
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const fetchMock = vi.fn().mockResolvedValue(
      reponseApi({ data: { session_id: 7, token: JETON, expires_at: expiresAt, target: { id: 42, name: 'Awa Ndiaye' } } }, 201),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await demarrer(
      requete('/api/impersonation/start', { auth_token: 'jeton-operateur' }, {
        method: 'POST',
        body: JSON.stringify({ user_id: 42, reason: 'Ticket support 4821.' }),
      }),
    );

    expect(res.status).toBe(201);
    const texte = await res.text();
    expect(texte).not.toContain(JETON);
    expect(texte).not.toContain('token');
    expect(JSON.parse(texte)).toEqual({ data: { session_id: 7, expires_at: expiresAt, target: { id: 42, name: 'Awa Ndiaye' } } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/admin\/users\/42\/impersonate$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-operateur');
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'Ticket support 4821.' });

    const jeton = cookiePose(res, 'impersonation_token');
    expect(jeton).toBeDefined();
    expect(decodeURIComponent(jeton!.split(';')[0].split('=').slice(1).join('='))).toBe(JETON);
    expect(jeton).toMatch(/HttpOnly/i);
    expect(jeton).toMatch(/SameSite=strict/i);
    const maxAge = Number(/Max-Age=(\d+)/i.exec(jeton!)?.[1]);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(15 * 60);
    // Un cookie DISTINCT : celui de l'opérateur n'est ni touché ni remplacé.
    expect(cookiePose(res, 'auth_token')).toBeUndefined();

    const temoin = cookiePose(res, 'impersonation_active');
    expect(temoin).toMatch(/^impersonation_active=1;/);
    expect(temoin).not.toMatch(/HttpOnly/i);
  });

  it('relaie un refus de l\'API sans poser de cookie', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponseApi({ code: 'two_factor_step_up_required' }, 403)));

    const res = await demarrer(
      requete('/api/impersonation/start', { auth_token: 'jeton-operateur' }, {
        method: 'POST',
        body: JSON.stringify({ user_id: 42, reason: 'Ticket support 4821.' }),
      }),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: 'two_factor_step_up_required' });
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it('sans session d\'opérateur : 401, l\'API n\'est pas appelée', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await demarrer(requete('/api/impersonation/start', {}, { method: 'POST', body: '{"user_id":42}' }));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/impersonation/stop', () => {
  it('appelle stop avec le jeton de l\'opérateur et efface les deux cookies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponseApi({ data: { session_id: 7, ended_at: '2026-10-08T10:15:00Z' } }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await terminer(
      requete('/api/impersonation/stop', { auth_token: 'jeton-operateur', impersonation_token: JETON }, { method: 'POST' }),
    );

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/admin\/impersonate\/stop$/);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-operateur');
    expect(efface(res, 'impersonation_token')).toBe(true);
    expect(efface(res, 'impersonation_active')).toBe(true);
    expect(cookiePose(res, 'auth_token')).toBeUndefined();
  });

  it('efface les cookies même quand la session est déjà fermée (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponseApi({ code: 'impersonation.no_session' }, 404)));

    const res = await terminer(
      requete('/api/impersonation/stop', { auth_token: 'jeton-operateur', impersonation_token: JETON }, { method: 'POST' }),
    );

    expect(res.status).toBe(404);
    expect(efface(res, 'impersonation_token')).toBe(true);
  });
});

describe('GET /api/impersonation/current', () => {
  it('hors session : 404 sans appeler l\'API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await courante(requete('/api/impersonation/current', { auth_token: 'jeton-operateur' }));

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lit la session avec le jeton d\'impersonation ; une session morte efface les cookies', async () => {
    const session = { data: { session_id: 7, target: { id: 42, name: 'Awa' }, read_only: true } };
    const fetchMock = vi.fn().mockResolvedValueOnce(reponseApi(session)).mockResolvedValueOnce(reponseApi({}, 401));
    vi.stubGlobal('fetch', fetchMock);

    const vivante = await courante(requete('/api/impersonation/current', { impersonation_token: JETON }));
    expect(vivante.status).toBe(200);
    expect(await vivante.json()).toEqual(session);
    expect((fetchMock.mock.calls[0][1].headers as Record<string, string>).Authorization).toBe(`Bearer ${JETON}`);

    const morte = await courante(requete('/api/impersonation/current', { impersonation_token: JETON }));
    expect(morte.status).toBe(404);
    expect(efface(morte, 'impersonation_token')).toBe(true);
  });
});

describe('relais /api/impersonation/proxy/*', () => {
  const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });

  it('ajoute le jeton d\'impersonation côté serveur, sans le profil actif ni les cookies de l\'opérateur', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponseApi({ data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await relaiGet(
      requete(
        '/api/impersonation/proxy/properties?per_page=5',
        { auth_token: 'jeton-operateur', impersonation_token: JETON, active_profile_id: 'agency_admin:3' },
        { headers: { 'X-Active-Profile-Hint': 'agency_admin:3', 'X-Profile-Id': 'agency_admin:3' } },
      ),
      ctx(['properties']),
    );

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/properties\?per_page=5$/);
    const enTetes = init.headers as Record<string, string>;
    expect(enTetes.Authorization).toBe(`Bearer ${JETON}`);
    expect(Object.keys(enTetes).map((k) => k.toLowerCase())).not.toEqual(
      expect.arrayContaining(['x-active-profile-hint']),
    );
    expect(Object.keys(enTetes).map((k) => k.toLowerCase())).not.toContain('x-profile-id');
    expect(Object.keys(enTetes).map((k) => k.toLowerCase())).not.toContain('cookie');
  });

  it('relaie le refus d\'écriture de l\'API tel quel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reponseApi({ code: 'impersonation.read_only', message: 'Lecture seule.' }, 403)));

    const res = await relaiPost(
      requete('/api/impersonation/proxy/properties', { impersonation_token: JETON }, { method: 'POST', body: '{}' }),
      ctx(['properties']),
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'impersonation.read_only' });
  });

  it('sans session : 401 et cookies effacés, sans appeler l\'API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await relaiGet(requete('/api/impersonation/proxy/properties', {}), ctx(['properties']));

    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(efface(res, 'impersonation_active')).toBe(true);
  });
});

describe('proxy générique de la console', () => {
  const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });

  it.each([[['users', '42', 'impersonate']], [['impersonate', 'stop']]])(
    'refuse %j en 404 sans appeler l\'API',
    async (segments) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const res = await consolePost(
        requete(`/api/super-admin/${segments.join('/')}`, { auth_token: 'jeton-operateur' }, { method: 'POST', body: '{}' }),
        ctx(segments),
      );

      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('relaie toujours le reste de la console', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reponseApi({ data: {} }));
    vi.stubGlobal('fetch', fetchMock);

    await consolePost(
      requete('/api/super-admin/users/42/block', { auth_token: 'jeton-operateur' }, { method: 'POST', body: '{}' }),
      ctx(['users', '42', 'block']),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
