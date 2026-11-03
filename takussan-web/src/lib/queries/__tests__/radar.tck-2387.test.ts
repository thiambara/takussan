import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  discardRadarListing,
  fetchNextRadarListingId,
  fetchRadarListing,
  fetchRadarMatches,
  markRadarListingDuplicate,
  patchRadarListing,
  radarKeys,
  reviewRadarListing,
  setRadarListingAdvertiser,
} from '../radar';

/**
 * TCK-2387 — la fiche du Radar, au niveau de la requête : ce qui part vers le relais
 * `/api/super-admin/*`.
 */
function repondre(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('queries de la fiche du Radar', () => {
  it('la lecture est un GET sur la fiche, avec les cookies', async () => {
    const fetchMock = repondre({ data: { id: 42 } });
    await fetchRadarListing(42);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/super-admin/radar/listings/42');
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('la correction est un PATCH qui n\'envoie que les champs modifiés', async () => {
    const fetchMock = repondre({ data: { id: 42 } });
    await patchRadarListing(42, { price: 400000 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/super-admin/radar/listings/42');
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', Accept: 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ price: 400000 });
  });

  it('un null part tel quel : il efface le champ', async () => {
    const fetchMock = repondre({ data: { id: 42 } });
    await patchRadarListing(42, { bedrooms: null, neighborhood_id: 12 });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      bedrooms: null,
      neighborhood_id: 12,
    });
  });

  it('un refus lève une ApiError qui garde le statut et le code', async () => {
    repondre({ code: 'radar.listing.stage_conflict', params: { stage: 'reviewed' } }, 409);
    const erreur = await patchRadarListing(42, { price: 1 }).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ApiError);
    expect((erreur as ApiError).status).toBe(409);
    expect((erreur as ApiError).data).toMatchObject({ code: 'radar.listing.stage_conflict' });
  });

  it('un identifiant qui sortirait du chemin n\'envoie aucun appel', async () => {
    const fetchMock = repondre({});
    await expect(fetchRadarListing('1/../2' as unknown as number)).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('la clé de la fiche est rangée sous celle du Radar : la saisie et la liste l\'invalident avec lui', () => {
    expect(radarKeys.detail(42)).toEqual(['super-admin', 'radar', 'detail', 42]);
    expect(radarKeys.detail(42).slice(0, radarKeys.all.length)).toEqual([...radarKeys.all]);
  });
});

describe('queries des gestes et des rapprochements du Radar', () => {
  const appel = (fetchMock: ReturnType<typeof repondre>) => {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url, init, corps: init.body === undefined ? undefined : JSON.parse(init.body as string) };
  };

  it('les rapprochements sont un GET sur `…/matches`', async () => {
    const fetchMock = repondre({ data: { photos: { status: 'none', total: 0, done: 0 }, matches: [] } });
    await fetchRadarMatches(42);

    const { url, init } = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/listings/42/matches');
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('valider est un POST sans corps', async () => {
    const fetchMock = repondre({ data: { id: 42 } });
    await reviewRadarListing(42);

    const { url, init, corps } = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/listings/42/review');
    expect(init.method).toBe('POST');
    expect(corps).toBeUndefined();
  });

  it('doublon : exactement UNE clé part, même si l\'appelant en passe deux', async () => {
    const fetchMock = repondre({ data: { id: 42 } });
    await markRadarListingDuplicate(42, { of_property_id: 7 });
    expect(appel(fetchMock).url).toBe('/api/super-admin/radar/listings/42/duplicate');
    expect(appel(fetchMock).init.method).toBe('POST');
    expect(appel(fetchMock).corps).toEqual({ of_property_id: 7 });

    const autre = repondre({ data: { id: 42 } });
    await markRadarListingDuplicate(42, { of_listing_id: 17 });
    expect(appel(autre).corps).toEqual({ of_listing_id: 17 });

    const deux = repondre({ data: { id: 42 } });
    await markRadarListingDuplicate(42, { of_listing_id: 17, of_property_id: 7 } as never);
    expect(Object.keys(appel(deux).corps)).toEqual(['of_listing_id']);
  });

  it('écarter est un POST `{reason}`', async () => {
    const fetchMock = repondre({ data: { id: 42 } });
    await discardRadarListing(42, 'no_longer_available');

    const { url, init, corps } = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/listings/42/discard');
    expect(init.method).toBe('POST');
    expect(corps).toEqual({ reason: 'no_longer_available' });
  });

  it('changer d\'annonceur est un PUT `{phone}`', async () => {
    const fetchMock = repondre({ data: { id: 42 } });
    await setRadarListingAdvertiser(42, '+221761112233');

    const { url, init, corps } = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/listings/42/advertiser');
    expect(init.method).toBe('PUT');
    expect(corps).toEqual({ phone: '+221761112233' });
  });

  it('un refus de geste garde le statut et le code', async () => {
    repondre({ code: 'radar.review.incomplete', params: { fields: ['neighborhood_id'] } }, 422);
    const erreur = await reviewRadarListing(42).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ApiError);
    expect((erreur as ApiError).status).toBe(422);
    expect((erreur as ApiError).data).toMatchObject({ code: 'radar.review.incomplete', params: { fields: ['neighborhood_id'] } });
  });

  it('la fiche suivante : la plus ancienne `extracted`, sans la fiche courante', async () => {
    const fetchMock = repondre({ data: [{ id: 42 }, { id: 57 }], meta: {} });
    const suivante = await fetchNextRadarListingId(42);

    expect(suivante).toBe(57);
    const { url } = appel(fetchMock);
    const params = new URL(url, 'http://x').searchParams;
    expect(new URL(url, 'http://x').pathname).toBe('/api/super-admin/radar/listings');
    expect(params.get('filter[stage]')).toBe('extracted');
    expect(params.get('sort')).toBe('created_at');
    expect(params.get('fields[radar_listings]')).toBe('id');
  });

  it('la fiche suivante : `null` quand seule la fiche courante reste', async () => {
    repondre({ data: [{ id: 42 }], meta: {} });
    expect(await fetchNextRadarListingId(42)).toBeNull();

    repondre({ data: [], meta: {} });
    expect(await fetchNextRadarListingId(42)).toBeNull();
  });
});
