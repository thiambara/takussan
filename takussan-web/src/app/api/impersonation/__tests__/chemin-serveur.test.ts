// @vitest-environment node
/**
 * TCK-600 (verif-600 B1) — les route handlers de l'impersonation joignent l'API comme `apiFetch` et
 * `apiRequest` : par le chemin SERVEUR (`API_INTERNAL_URL`, TCK-598) et avec l'IP du visiteur établie
 * par la chaîne de confiance. Ils lisaient `NEXT_PUBLIC_API_URL` et n'envoyaient aucun
 * `X-Forwarded-For` : `start`, la session et chaque lecture relayée partaient de l'IP du serveur Next.
 *
 * L'entrée la plus à gauche est FORGÉE : la retenir serait laisser l'opérateur écrire l'IP du journal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));

import { cookies, headers } from 'next/headers';

import { POST as demarrer } from '../start/route';
import { POST as terminer } from '../stop/route';
import { GET as courante } from '../current/route';
import { GET as relaiGet } from '../proxy/[...path]/route';
import { POST as deconnecter } from '../../auth/logout/route';

const INTERNE = 'http://api-interne:8000';
const XFF = '198.51.100.66, 203.0.113.7, 10.0.0.2';
const VISITEUR = '203.0.113.7';
const COOKIES: Record<string, string> = { auth_token: 'jeton-operateur', impersonation_token: '42|jeton-imp' };

function requete(url: string, init: RequestInit = {}): NextRequest {
  const enTetes = new Headers(init.headers);
  enTetes.set('cookie', Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; '));
  enTetes.set('x-forwarded-for', XFF);
  return new NextRequest(new URL(url, 'http://localhost:3113'), { ...init, headers: enTetes } as never);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.mocked(headers).mockResolvedValue(new Headers({ 'x-forwarded-for': XFF }) as never);
  vi.mocked(cookies).mockResolvedValue({ get: (nom: string) => (nom in COOKIES ? { value: COOKIES[nom] } : undefined) } as never);
  vi.stubEnv('VISITOR_IP_TRUSTED_HOPS', '2');
  fetchMock = vi.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ data: { session_id: 7, token: 'T', expires_at: new Date(Date.now() + 60_000).toISOString(), target: { id: 42 } } }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const GESTES: [string, () => Promise<Response>, RegExp][] = [
  ['start', () => demarrer(requete('/api/impersonation/start', { method: 'POST', body: JSON.stringify({ user_id: 42, reason: 'Ticket 4821.' }) })), /\/api\/admin\/users\/42\/impersonate$/],
  ['stop', () => terminer(requete('/api/impersonation/stop', { method: 'POST' })), /\/api\/admin\/impersonate\/stop$/],
  ['current', () => courante(requete('/api/impersonation/current')), /\/api\/impersonation\/current$/],
  ['relais', () => relaiGet(requete('/api/impersonation/proxy/leases?page=2'), { params: Promise.resolve({ path: ['leases'] }) }), /\/api\/leases\?page=2$/],
  ['logout', () => deconnecter(), /\/api\/admin\/impersonate\/stop$/],
];

function appel(motif: RegExp): [string, Record<string, string>] {
  const trouve = fetchMock.mock.calls.find(([url]) => motif.test(String(url)));
  expect(trouve, `aucun appel amont vers ${motif}`).toBeDefined();
  return [String(trouve![0]), (trouve![1] as RequestInit).headers as Record<string, string>];
}

describe.each(GESTES)('%s', (_nom, geste, motif) => {
  it('passe par API_INTERNAL_URL avec l\'IP du visiteur, jamais l\'entrée forgée', async () => {
    vi.stubEnv('API_INTERNAL_URL', INTERNE);
    await geste();
    const [url, enTetes] = appel(motif);
    expect(url.startsWith(`${INTERNE}/api/`)).toBe(true);
    expect(enTetes['X-Forwarded-For']).toBe(VISITEUR);
    expect(enTetes['X-Forwarded-Host']).toBeTruthy();
    expect(enTetes.Authorization).toMatch(/^Bearer /);
  });

  it('sans chemin interne, garde l\'URL publique et transmet quand même l\'IP', async () => {
    vi.stubEnv('API_INTERNAL_URL', '');
    await geste();
    const [url, enTetes] = appel(motif);
    expect(url.startsWith(INTERNE)).toBe(false);
    expect(enTetes['X-Forwarded-For']).toBe(VISITEUR);
    expect(enTetes['X-Forwarded-Host']).toBeUndefined();
  });
});
