// @vitest-environment node
/**
 * TCK-613 (ADR-0044 §2) — le relais BFF du lien de l'export du journal d'audit : sans session, la
 * connexion (qui ramène ici) et aucun appel ; avec session, le chemin signé part OCTET POUR OCTET
 * (la signature se recalcule sur la chaîne brute) avec le jeton, et le fichier revient avec ses
 * en-têtes ; une navigation douce (`RSC`) n'atteint pas l'API.
 */
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';
import { origineApi } from '@/lib/config-publique';

const API = origineApi();
const REQUETE = '?expires=1763300000&file=0f8fad5b-d9cb-469f-a165-70867728950e.csv&name=audit%20trail%2B%C3%A9t%C3%A9.csv&signature=abc123&user=7';

function requete(cookies: Record<string, string>, entetes: Record<string, string> = {}): NextRequest {
  const req = new NextRequest(`http://localhost:3000/api/activity-logs/export/download${REQUETE}`, { headers: entetes });
  for (const [nom, valeur] of Object.entries(cookies)) req.cookies.set(nom, valeur);
  return req;
}

afterEach(() => vi.unstubAllGlobals());

describe('GET /api/activity-logs/export/download', () => {
  it('sans session : vers la connexion, qui ramène au lien, et l\'API n\'est pas appelée', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(requete({}));

    expect(res.status).toBe(307);
    const connexion = new URL(res.headers.get('location') ?? '');
    expect(connexion.pathname).toBe('/auth/login');
    expect(connexion.searchParams.get('redirect')).toBe(`/api/activity-logs/export/download${REQUETE}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('une navigation douce (RSC) n\'atteint pas l\'API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(requete({ auth_token: 'jeton-A' }, { rsc: '1' }));

    expect(res.headers.get('content-type')).toBe('text/plain');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('relaie le chemin signé tel quel avec le jeton, et le fichier avec ses en-têtes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('id,logged_at\n1,2026-11-16\n', {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=UTF-8',
          'content-disposition': 'attachment; filename="audit.csv"',
          'set-cookie': 'laravel_session=secret',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await GET(requete({ auth_token: 'jeton-A' }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API}/api/activity-logs/export/download${REQUETE}`);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jeton-A' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="audit.csv"');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(await res.text()).toContain('1,2026-11-16');
  });

  it('un refus de l\'API (autre demandeur) passe tel quel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    })));

    const res = await GET(requete({ auth_token: 'jeton-B' }));

    expect(res.status).toBe(403);
  });
});
