import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiRequest = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  // `buildQueryString` reste le vrai : on éprouve l'URL qu'il produit.
  return { ...reel, apiRequest: (...args: unknown[]) => mockApiRequest(...args) };
});

const { dismissSuggestedStage, fetchPipelineColumn, fetchPipelineColumnPage, fetchPipelineList, fetchPipelineStats } = await import('@/lib/queries/pipeline');

const params = (url: string) => new URLSearchParams(url.split('?')[1] ?? '');

/**
 * TCK-2592 — la portée et les filtres partent aux colonnes, à la liste et aux statistiques ; l'étape
 * d'une colonne l'emporte sur tout filtre d'étape ; « Plus tard » envoie le fait vu.
 */
describe('pipeline — lectures de TCK-2592', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ data: [], meta: { total: 0 } });
  });

  it('une colonne porte la portée et les filtres, et son étape', async () => {
    await fetchPipelineColumn('jeton', { stage: 'qualified', filtres: { status: 'active', referent: 'me', tags: 'vip', follow_up: '1' } });
    const p = params(String(mockApiRequest.mock.calls[0][0]));
    expect(p.get('filter[pipeline_stage]')).toBe('qualified');
    expect(p.get('filter[referent]')).toBe('me');
    expect(p.get('filter[tags]')).toBe('vip');
    expect(p.get('filter[follow_up]')).toBe('1');
    expect(p.get('filter[status]')).toBe('active');
  });

  it('une page de colonne rend son compte, `meta.total`, celui d’une colonne bornée (décision 1b)', async () => {
    mockApiRequest.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }], meta: { total: 51 } });
    const page = await fetchPipelineColumnPage('jeton', { stage: 'converted', filtres: { status: 'active', exited_within_days: '30' }, page: 2 });
    expect(page).toEqual({ cartes: [{ id: 1 }, { id: 2 }], total: 51 });
    const p = params(String(mockApiRequest.mock.calls[0][0]));
    expect(p.get('filter[exited_within_days]')).toBe('30');
    expect(p.get('page')).toBe('2');
    // Sans `meta`, la page est tout ce qu'il y a : aucune autre à lire.
    mockApiRequest.mockResolvedValue({ data: [{ id: 3 }] });
    expect((await fetchPipelineColumnPage('jeton', { stage: 'lost' })).total).toBe(1);
  });

  it('la liste lit les étapes vivantes, triée par retard, et rend son total', async () => {
    mockApiRequest.mockResolvedValue({ data: [{ id: 1 }], meta: { total: 38 } });
    const page = await fetchPipelineList('jeton', { filtres: { status: 'active', referent: '7', follow_up: '1' }, page: 2 });
    const url = String(mockApiRequest.mock.calls[0][0]);
    expect(url.startsWith('/api/customers?')).toBe(true);
    const p = params(url);
    expect(p.get('filter[stage_group]')).toBe('active');
    expect(p.get('filter[pipeline_stage]')).toBeNull();
    expect(p.get('filter[referent]')).toBe('7');
    expect(p.get('filter[follow_up]')).toBe('1');
    expect(p.get('sort')).toBe('-follow_up_days');
    expect(p.get('page')).toBe('2');
    expect(p.get('fields[customers]')).toContain('follow_up');
    expect(page).toEqual({ lignes: [{ id: 1 }], total: 38 });
  });

  it('les statistiques portent scope et filtres ; sans paramètre, la lecture d’avant', async () => {
    mockApiRequest.mockResolvedValue({ data: {} });
    await fetchPipelineStats('jeton', { scope: 'agency', filter: { status: 'active', referent: '7', search: 'awa' } });
    const url = String(mockApiRequest.mock.calls[0][0]);
    expect(url.startsWith('/api/customers/pipeline-stats?')).toBe(true);
    const p = params(url);
    expect(p.get('scope')).toBe('agency');
    expect(p.get('filter[referent]')).toBe('7');
    expect(p.get('filter[search]')).toBe('awa');

    await fetchPipelineStats('jeton');
    expect(String(mockApiRequest.mock.calls[1][0])).toBe('/api/customers/pipeline-stats');
  });

  it('« Plus tard » envoie le fait vu à dismiss', async () => {
    await dismissSuggestedStage('jeton', 12, 'visit_interested');
    expect(mockApiRequest).toHaveBeenCalledWith('/api/customers/12/suggested-stage/dismiss', {
      method: 'POST',
      body: { reason_event: 'visit_interested' },
      token: 'jeton',
    });
  });
});
