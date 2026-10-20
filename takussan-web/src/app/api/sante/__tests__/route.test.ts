// @vitest-environment node
/**
 * TCK-948 (P44.01) — `GET /api/sante` : le front joint-il l'API ?
 *
 * Le `HEALTHCHECK` de l'image et la preuve d'`images.yml` lisaient `/robots.txt`, qui ne joint
 * rien : un front dont `API_INTERNAL_URL` visait un hôte injoignable était déclaré sain, et le
 * déploiement vert. Cette route joint `/up` par le chemin des lectures serveur (`API_INTERNAL_URL`,
 * sinon `API_URL`) et rend 200 ou 503. Elle n'est PAS le `HEALTHCHECK` : une panne de l'API ne doit
 * pas arrêter le front.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { GET, dynamic } = await import('../route');

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'https://api.publique.test');
  vi.stubEnv('API_INTERNAL_URL', '');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const urlAppelee = () => String(fetchMock.mock.calls[0]?.[0]);

describe('GET /api/sante', () => {
  it('rend 200 quand l\'API répond 200 sur /up, par le chemin INTERNE quand il est posé', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://takussan-api-preview:8080');
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ api: 'ok' });
    expect(urlAppelee()).toBe('http://takussan-api-preview:8080/up');
    // Les en-têtes du chemin interne, comme pour toute lecture serveur : le schéma public, jamais
    // l'hôte (TCK-1058, P73.01 : l'API tire l'hôte de ses URL d'`APP_URL`).
    const enTetes = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(enTetes['X-Forwarded-Proto']).toBeTruthy();
    expect(enTetes['X-Forwarded-Host']).toBeUndefined();
  });

  it('retombe sur API_URL quand API_INTERNAL_URL est absente', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    expect((await GET()).status).toBe(200);
    expect(urlAppelee()).toBe('https://api.publique.test/up');
  });

  it('ne met rien en cache : ni l\'appel amont, ni sa propre réponse', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));

    const res = await GET();

    expect(fetchMock.mock.calls[0]?.[1]?.cache).toBe('no-store');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(dynamic).toBe('force-dynamic');
  });

  // Le 3xx et le délai s'éprouvent contre un VRAI serveur : `route.serveur-reel.test.ts`.
  it.each([500, 502, 404])('rend 503 quand l\'API répond %i', async (statut) => {
    fetchMock.mockResolvedValue(new Response('', { status: statut }));

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ api: 'ko', amont: statut });
  });

  it('rend 503 quand l\'API est injoignable, sans livrer l\'adresse ni l\'erreur', async () => {
    vi.stubEnv('API_INTERNAL_URL', 'http://127.0.0.1:9');
    fetchMock.mockRejectedValue(new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 127.0.0.1:9') }));

    const res = await GET();

    expect(res.status).toBe(503);
    const corps = await res.text();
    expect(JSON.parse(corps)).toEqual({ api: 'ko', amont: null });
    expect(corps).not.toContain('127.0.0.1');
    expect(console.error).toHaveBeenCalled();
  });
});
