import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  claimRadarAdvertiser,
  fetchRadarAdvertiser,
  markRadarOutreachSent,
  prepareRadarOutreach,
  radarKeys,
  releaseRadarAdvertiser,
  retouchRadarOutreach,
} from '../radar';

/**
 * TCK-2388 — la fiche annonceur et son message, au niveau de la requête : ce qui part vers le relais
 * `/api/super-admin/*`. Le préfixe `/api` est écrit : ni `fetch` ni le relais ne l'ajoutent.
 */
function repondre(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(status === 204 ? null : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const appel = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls[0] as [string, RequestInit];

afterEach(() => vi.unstubAllGlobals());

describe('queries de la fiche annonceur du Radar', () => {
  it('la lecture est un GET sur la fiche, avec les cookies', async () => {
    const fetchMock = repondre({ data: { id: 7 } });
    await fetchRadarAdvertiser(7);

    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/advertisers/7');
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('prendre en charge est un POST sans corps sur …/claim', async () => {
    const fetchMock = repondre({ data: { claim: { by: { id: 1, name: 'A' }, until: '2026-10-28T10:10:00Z', mine: true } } });
    const reponse = await claimRadarAdvertiser(7);

    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/advertisers/7/claim');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
    expect(reponse.data.claim.mine).toBe(true);
  });

  it('rendre est un DELETE sur …/claim, et le 204 sans corps ne se lit pas comme du JSON', async () => {
    const fetchMock = repondre(null, 204);
    await expect(releaseRadarAdvertiser(7)).resolves.toBeUndefined();

    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/advertisers/7/claim');
    expect(init.method).toBe('DELETE');
    expect(init.credentials).toBe('include');
  });

  it('un refus de la restitution lève une ApiError qui garde son code', async () => {
    repondre({ code: 'radar.advertiser.claim_not_held', params: {} }, 409);
    const erreur = await releaseRadarAdvertiser(7).catch((e: unknown) => e);

    expect(erreur).toBeInstanceOf(ApiError);
    expect((erreur as ApiError).status).toBe(409);
    expect((erreur as ApiError).data).toMatchObject({ code: 'radar.advertiser.claim_not_held' });
  });

  it('préparer sur des annonces envoie {listing_ids, locale}, et rien d\'autre', async () => {
    const fetchMock = repondre({ data: { id: 1 } }, 201);
    await prepareRadarOutreach(7, { listing_ids: [12, 13], locale: 'en' });

    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/advertisers/7/outreaches');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json', Accept: 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ listing_ids: [12, 13], locale: 'en' });
  });

  it('relancer envoie {follow_up_of_id, locale}', async () => {
    const fetchMock = repondre({ data: { id: 2 } }, 201);
    await prepareRadarOutreach(7, { follow_up_of_id: 5, locale: 'fr' });
    expect(JSON.parse(appel(fetchMock)[1].body as string)).toEqual({ follow_up_of_id: 5, locale: 'fr' });
  });

  it('retoucher est un PATCH qui n\'envoie que les parties modifiées', async () => {
    const fetchMock = repondre({ data: { id: 3 } });
    await retouchRadarOutreach(3, { salutation: 'Bonjour Awa' });

    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/outreaches/3');
    expect(init.method).toBe('PATCH');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body as string)).toEqual({ salutation: 'Bonjour Awa' });
  });

  it('« envoyé » est un POST sans corps sur …/sent', async () => {
    const fetchMock = repondre({ data: { id: 3 } });
    await markRadarOutreachSent(3);

    const [url, init] = appel(fetchMock);
    expect(url).toBe('/api/super-admin/radar/outreaches/3/sent');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });

  it('un identifiant qui sortirait du chemin n\'envoie aucun appel', async () => {
    const fetchMock = repondre({});
    await expect(fetchRadarAdvertiser('1/../2' as unknown as number)).rejects.toBeInstanceOf(ApiError);
    await expect(retouchRadarOutreach('3?x=1' as unknown as number, { resume: 'x' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('la clé de la fiche annonceur est rangée sous celle du Radar : chaque geste l\'invalide avec lui', () => {
    expect(radarKeys.advertiser(7)).toEqual(['super-admin', 'radar', 'advertiser', 7]);
    expect(radarKeys.advertiser(7).slice(0, radarKeys.all.length)).toEqual([...radarKeys.all]);
    expect(radarKeys.advertiser(7).slice(0, radarKeys.advertisers().length)).toEqual([...radarKeys.advertisers()]);
  });
});
