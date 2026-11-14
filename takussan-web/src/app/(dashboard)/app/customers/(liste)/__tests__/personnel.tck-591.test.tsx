/**
 * TCK-591 §9 (front) — « Ajouter un client » et le lien vers le pipeline sont des gestes du
 * personnel : un bailleur garde la lecture de ses fiches, sans l'entrée de création ni le kanban.
 *
 * TCK-2590 — la page lit l'URL et la traduit en lecture de l'API : la vue « À relancer » émet
 * `filter[follow_up]=1&sort=-follow_up_days` (AC2), `per_page` est transmis (AC4), chaque vue est
 * comptée (`per_page=1`) ; le rendu est celui de `ListeDesClients` (son test porte les gestes).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
const me = vi.hoisted(() => ({ roles: ['agent'] as string[] }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: me.roles }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
const api = vi.hoisted(() => ({ liste: vi.fn(), compte: vi.fn(), etiquettes: vi.fn() }));
vi.mock('@/lib/queries/customers', () => ({
  fetchDashboardCustomers: api.liste,
  fetchCustomerCount: api.compte,
  fetchCrmTags: api.etiquettes,
}));
vi.mock('@/components/customer-dashboard/liste/ListeDesClients', () => ({ ListeDesClients: () => null }));
const capacites = vi.hoisted(() => ({ lire: vi.fn() }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: capacites.lire }));

import Page from '../page';

async function ouvrir(params: Record<string, string> = {}) {
  const element = (await Page({ searchParams: Promise.resolve(params) })) as { props: Record<string, unknown> } | null;
  return element!.props;
}

beforeEach(() => {
  capacites.lire.mockReset().mockResolvedValue(['crm.view_all', 'crm.assign']);
  api.etiquettes.mockReset().mockResolvedValue([]);
  api.liste.mockReset().mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
  api.compte.mockReset().mockImplementation(async (_jeton: string, filtres: Record<string, string>) => (filtres.follow_up ? 6 : filtres.referent ? 38 : filtres.pipeline_stage ? 10 : 141));
});

describe('/app/customers — entrées réservées au personnel (TCK-591 §9)', () => {
  it('un agent est du personnel : il crée et a les vues', async () => {
    me.roles = ['agent'];
    const p = await ouvrir();
    expect(p.personnel).toBe(true);
    expect(p.vues).toEqual(['a-relancer', 'mes-clients', 'negociation', 'tous']);
  });

  it('un bailleur ne l’est pas : ni création, ni vues, ni comptes', async () => {
    me.roles = ['owner'];
    const p = await ouvrir({ vue: 'a-relancer' });
    expect(p.personnel).toBe(false);
    expect(p.vues).toEqual([]);
    expect(api.compte).not.toHaveBeenCalled();
    expect(api.liste.mock.calls[0][1].filters.follow_up).toBeUndefined();
  });
});

describe('/app/customers — l’URL lue (TCK-2590)', () => {
  it('« À relancer » : filter[follow_up]=1 et sort=-follow_up_days ; les comptes de chaque vue (AC2)', async () => {
    me.roles = ['agent'];
    const p = await ouvrir({ vue: 'a-relancer' });
    expect(api.liste).toHaveBeenCalledWith('jeton', expect.objectContaining({ sort: '-follow_up_days', filters: expect.objectContaining({ follow_up: '1' }) }));
    expect(p.comptes).toEqual({ 'a-relancer': 6, 'mes-clients': 38, negociation: 10, tous: 141 });
    expect(api.compte).toHaveBeenCalledWith('jeton', {});
  });

  it('per_page=50 est transmis tel quel (AC4)', async () => {
    me.roles = ['agent'];
    await ouvrir({ per_page: '50', page: '2' });
    expect(api.liste).toHaveBeenCalledWith('jeton', expect.objectContaining({ page: 2, perPage: 50 }));
  });

  it('l’admin a « Sans référent », compté par filter[referent]=none', async () => {
    me.roles = ['agency_admin'];
    const p = await ouvrir({ vue: 'sans-referent' });
    expect(p.vues).toContain('sans-referent');
    expect(api.liste.mock.calls[0][1].filters.referent).toBe('none');
    expect(api.compte).toHaveBeenCalledWith('jeton', { referent: 'none' });
  });

  it('une vue ou un filtre posé : l’état vide le dit (`filtre`)', async () => {
    me.roles = ['agent'];
    expect((await ouvrir()).filtre).toBe(false);
    expect((await ouvrir({ tags: 'vip' })).filtre).toBe(true);
    expect((await ouvrir({ vue: 'mes-clients' })).filtre).toBe(true);
  });
});

describe('/app/customers — « Me désigner » et les lectures en parallèle (TCK-2590)', () => {
  it('offert à l’agent qui porte crm.assign, avec son identifiant', async () => {
    me.roles = ['agent'];
    expect((await ouvrir()).designer).toEqual({ moi: 1 });
  });

  it('refusé sans la capacité, sur une lecture en panne, et au bailleur — qu’on ne lit même pas', async () => {
    me.roles = ['agent'];
    capacites.lire.mockResolvedValue(['crm.view_all']);
    expect((await ouvrir()).designer).toBeNull();
    capacites.lire.mockResolvedValue(null);
    expect((await ouvrir()).designer).toBeNull();
    capacites.lire.mockClear();
    me.roles = ['owner'];
    expect((await ouvrir()).designer).toBeNull();
    expect(capacites.lire).not.toHaveBeenCalled();
  });

  it('la liste, les étiquettes, les capacités et les quatre comptes partent ensemble, sans s’attendre', async () => {
    me.roles = ['agent'];
    const lances: string[] = [];
    const liberer: Array<() => void> = [];
    const suspendue = <T,>(nom: string, valeur: T) => {
      lances.push(nom);
      return new Promise<T>((resolve) => liberer.push(() => resolve(valeur)));
    };
    api.liste.mockImplementation(() => suspendue('liste', { data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } }));
    api.compte.mockImplementation(() => suspendue('compte', 1));
    capacites.lire.mockImplementation(() => suspendue('capacites', ['crm.assign']));
    api.etiquettes.mockImplementation(() => suspendue('etiquettes', []));

    const rendu = Page({ searchParams: Promise.resolve({}) });
    await new Promise((r) => setTimeout(r, 0));
    // Aucune réponse n'est encore arrivée : tout ce qui part, part maintenant.
    expect(lances.filter((n) => n === 'liste')).toHaveLength(1);
    expect(lances.filter((n) => n === 'capacites')).toHaveLength(1);
    expect(lances.filter((n) => n === 'etiquettes')).toHaveLength(1);
    expect(lances.filter((n) => n === 'compte')).toHaveLength(4);

    liberer.forEach((l) => l());
    expect(((await rendu) as { props: Record<string, unknown> }).props.designer).toEqual({ moi: 1 });
  });
});
