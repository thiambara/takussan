import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  deleteRadarListingPhoto,
  fetchRadarPublicationPreview,
  fetchRadarPublishedMessage,
  publishRadarAdvertiser,
  radarKeys,
  refetchRadarListingPhotos,
  uploadRadarListingPhotos,
} from '../radar';

/**
 * TCK-2389 — « Publier pour lui », au niveau de la requête : ce qui part vers le relais `/api/super-admin/*`. Le
 * préfixe `/api` est écrit ; la clé d'idempotence voyage dans `Idempotency-Key`, et c'est l'appelant qui la garde.
 */
function repondre(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const appel = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls[0] as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe('queries de « Publier pour lui »', () => {
  it('l\'aperçu est un GET sur …/publication-preview, avec les cookies', async () => {
    const fetchMock = repondre({ data: { listings: [] } });
    await fetchRadarPublicationPreview(7);

    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/advertisers/7/publication-preview');
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('publier est un POST de listing_ids sous Idempotency-Key', async () => {
    const fetchMock = repondre({ data: { properties: [] } }, 201);
    await publishRadarAdvertiser(7, [12, 13], 'cle-1');

    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/advertisers/7/publish');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ listing_ids: [12, 13] });
    expect(init.headers).toMatchObject({ 'Idempotency-Key': 'cle-1', 'Content-Type': 'application/json' });
  });

  it('la clé d\'idempotence est celle de l\'appelant : un réessai repart sous la même', async () => {
    const fetchMock = repondre({ code: 'idempotency.in_progress' }, 409);
    await expect(publishRadarAdvertiser(7, [12], 'meme-cle')).rejects.toBeInstanceOf(ApiError);
    await expect(publishRadarAdvertiser(7, [12], 'meme-cle')).rejects.toBeInstanceOf(ApiError);

    const cles = fetchMock.mock.calls.map(([, init]) => (init as RequestInit).headers as Record<string, string>).map((h) => h['Idempotency-Key']);
    expect(cles).toEqual(['meme-cle', 'meme-cle']);
  });

  it('un refus porte son statut et son code', async () => {
    repondre({ code: 'radar.publish.not_covered', params: { listing_ids: [13] } }, 422);
    const erreur = await publishRadarAdvertiser(7, [12, 13], 'cle').catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ApiError);
    expect((erreur as ApiError).status).toBe(422);
    expect((erreur as ApiError).data).toMatchObject({ code: 'radar.publish.not_covered' });
  });

  it('le second message se lit dans la langue demandée', async () => {
    const fetchMock = repondre({ data: { text: 'Bonjour', wa_me: 'https://wa.me/x', version: 'publie.v2' } });
    await fetchRadarPublishedMessage(7, 'en');

    const [url] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/advertisers/7/published-message?locale=en');
  });

  it('récupérer les photos de la source est un POST sans corps sur …/photos/fetch', async () => {
    const fetchMock = repondre({ data: { id: 12 } }, 202);
    await refetchRadarListingPhotos(12);

    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/listings/12/photos/fetch');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('déposer des photos est un multipart photos[]', async () => {
    const fetchMock = repondre({ data: { id: 12 } }, 201);
    const a = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const b = new File(['b'], 'b.png', { type: 'image/png' });
    await uploadRadarListingPhotos(12, [a, b]);

    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/listings/12/photos');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).getAll('photos[]')).toHaveLength(2);
    // Pas de Content-Type : le navigateur pose la frontière du multipart.
    expect(init.headers).toEqual({ Accept: 'application/json' });
  });

  it('retirer une photo est un DELETE qui rend 204 sans corps, et un échec porte son code', async () => {
    const fetchMock = repondre(null, 204);
    await expect(deleteRadarListingPhoto(12, 99)).resolves.toBeUndefined();
    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/listings/12/photos/99');
    expect(init.method).toBe('DELETE');

    repondre({ code: 'radar.photo.not_found' }, 404);
    const erreur = await deleteRadarListingPhoto(12, 99).catch((e: unknown) => e);
    expect((erreur as ApiError).data).toMatchObject({ code: 'radar.photo.not_found' });
  });

  it('un identifiant qui réécrirait le chemin est refusé avant tout appel', async () => {
    const fetchMock = repondre({});
    await expect(deleteRadarListingPhoto(12, '../advertisers' as unknown as number)).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('la clé de l\'aperçu est sous la racine du Radar, et propre à l\'annonceur', () => {
    expect(radarKeys.publication(7)).toEqual(['super-admin', 'radar', 'publication', 7]);
    expect(radarKeys.publication(7)).not.toEqual(radarKeys.publication(8));
  });
});
