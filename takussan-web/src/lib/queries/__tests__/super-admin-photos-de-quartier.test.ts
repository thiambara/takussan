import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import {
  envoyerPhoto,
  importerDeWikimedia,
  lienUnsplash,
  lirePropositionsWikimedia,
  listerQuartiersApprouves,
  refusDuFichier,
  retirerPhoto,
} from '../super-admin-photos-de-quartier';

/**
 * TCK-2844 (ADR-0109) — la photo d'un quartier passe par le relais `/api/super-admin/…`
 * (→ `/api/admin/…`) : liste filtrée CÔTÉ SERVEUR, envoi multipart, import par titre, retrait.
 */
const fetchMock = vi.fn();

function reponse(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });
}

function appel(n: number): { chemin: string; params: Record<string, string>; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  const u = new URL(url, 'http://test');
  return { chemin: u.pathname, params: Object.fromEntries(u.searchParams), init };
}

const LIGNE = {
  id: 41, name: 'Mermoz', slug: 'mermoz', status: 'approved', origin: 'dataset',
  city: { id: 3, name: 'Dakar' }, region: { id: 1, name: 'Dakar' }, created_by: null, addresses_count: 37,
  created_at: null, cover: { url: 'https://media.takussan.com/9/conversions/mermoz-display.webp', source: 'wikimedia' },
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('listerQuartiersApprouves', () => {
  it('lit les APPROUVÉS de la ville, cherchés par nom, les plus fournis d’abord', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ data: [LIGNE, { ...LIGNE, id: 42, name: 'Ngor', cover: null }], meta: { total: 2, per_page: 24, current_page: 2, last_page: 2 } }));

    const page = await listerQuartiersApprouves({ villeId: 3, recherche: ' mer ', page: 2 });

    const { chemin, params, init } = appel(0);
    expect(chemin).toBe('/api/super-admin/geo/neighborhoods');
    expect(params).toEqual({
      'filter[status]': 'approved',
      'filter[geo_city_id]': '3',
      'filter[search]': 'mer',
      sort: '-addresses_count',
      page: '2',
      per_page: '24',
    });
    expect(init.credentials).toBe('include');
    expect(page.data).toEqual([
      { id: 41, nom: 'Mermoz', ville: 'Dakar', adresses: 37, photo: { url: LIGNE.cover.url, source: 'wikimedia' } },
      { id: 42, nom: 'Ngor', ville: 'Dakar', adresses: 37, photo: null },
    ]);
  });

  it('sans ville ni recherche, ni l’un ni l’autre filtre ; `cover` absent vaut `null`', async () => {
    const { cover: _absent, ...sansCover } = LIGNE;
    fetchMock.mockResolvedValueOnce(reponse({ data: [sansCover], meta: { total: 1, per_page: 24, current_page: 1, last_page: 1 } }));

    const page = await listerQuartiersApprouves({ villeId: null, recherche: '', page: 1 });

    expect(appel(0).params).not.toHaveProperty('filter[geo_city_id]');
    expect(appel(0).params).not.toHaveProperty('filter[search]');
    expect(page.data[0].photo).toBeNull();
  });
});

describe('les gestes', () => {
  it('les propositions : `meta.unavailable` est rendu', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ data: [], meta: { unavailable: true } }));
    expect(await lirePropositionsWikimedia(41)).toEqual({ data: [], indisponible: true });
    expect(appel(0).chemin).toBe('/api/super-admin/geo/neighborhoods/41/cover/suggestions');
  });

  it('l’envoi est un multipart `file`, sans Content-Type posé à la main', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ data: LIGNE }));
    const fichier = new File(['x'], 'mermoz.jpg', { type: 'image/jpeg' });

    const ligne = await envoyerPhoto(41, fichier);

    const { chemin, init } = appel(0);
    expect(chemin).toBe('/api/super-admin/geo/neighborhoods/41/cover');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('file')).toBe(fichier);
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect(ligne.photo?.url).toBe(LIGNE.cover.url);
  });

  it('l’import envoie un TITRE, jamais une URL', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ data: LIGNE }));
    await importerDeWikimedia(41, 'File:Mermoz Dakar.jpg');

    const { chemin, init } = appel(0);
    expect(chemin).toBe('/api/super-admin/geo/neighborhoods/41/cover/import');
    expect(JSON.parse(init.body as string)).toEqual({ source: 'wikimedia', title: 'File:Mermoz Dakar.jpg' });
  });

  it('un refus de l’API lève une ApiError qui porte le code', async () => {
    fetchMock.mockResolvedValueOnce(reponse({ code: 'geo_cover.attribution_required', message: '…' }, 422));
    const erreur = await importerDeWikimedia(41, 'File:X.jpg').catch((e: unknown) => e);
    expect(erreur).toBeInstanceOf(ApiError);
    expect((erreur as ApiError).status).toBe(422);
    expect((erreur as ApiError).data).toMatchObject({ code: 'geo_cover.attribution_required' });
  });

  it('le retrait est un DELETE, et un 204 n’est pas une erreur', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(retirerPhoto(41)).resolves.toBeUndefined();
    expect(appel(0).init.method).toBe('DELETE');
  });
});

describe('contrôles locaux', () => {
  it('refuse un type hors JPEG/PNG/WebP, puis un fichier de plus de 10 Mo', () => {
    expect(refusDuFichier(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe('type');
    const lourd = new File(['x'], 'a.png', { type: 'image/png' });
    Object.defineProperty(lourd, 'size', { value: 10 * 1024 * 1024 + 1 });
    expect(refusDuFichier(lourd)).toBe('size');
    expect(refusDuFichier(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBeNull();
  });

  it('le lien Unsplash : quartier et ville, translittérés', () => {
    expect(lienUnsplash('Sacré-Cœur', 'Dakar')).toBe('https://unsplash.com/s/photos/sacre-coeur-dakar');
    expect(lienUnsplash('Point E', 'Dakar')).toBe('https://unsplash.com/s/photos/point-e-dakar');
  });
});
