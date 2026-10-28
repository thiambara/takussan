import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { fetchRadarListing, patchRadarListing, radarKeys } from '../radar';

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
