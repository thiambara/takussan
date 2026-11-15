/**
 * TCK-2596 (AC2) — « Prospects » de « Ma journée » mène à la liste des clients filtrée sur les étapes
 * vivantes ET « Mes clients ». La liste lit `stage_group=active` dans l'URL et le passe à l'API en
 * `filter[stage_group]=active` (TCK-2588) — le filtre est serveur, jamais un tri côté client.
 * Toute autre valeur est ignorée : l'API la refuserait d'un 422, la page tomberait.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CIBLES_DES_CHIFFRES } from '@/components/journee/MesChiffres';

import { lireLaListe } from '../liste-des-clients';

const AGENT = { personnel: true, admin: false };

describe('lireLaListe — stage_group (TCK-2596)', () => {
  it('stage_group=active devient le filtre des étapes vivantes, avec la vue « Mes clients »', () => {
    const e = lireLaListe({ vue: 'mes-clients', stage_group: 'active' }, AGENT);
    expect(e.filtres.stage_group).toBe('active');
    expect(e.filtres.referent).toBe('me');
  });

  it('une autre valeur, vide ou absente : aucun filtre (jamais un 422 de l’API)', () => {
    expect(lireLaListe({ stage_group: 'dormant' }, AGENT).filtres.stage_group).toBeUndefined();
    expect(lireLaListe({ stage_group: '' }, AGENT).filtres.stage_group).toBeUndefined();
    expect(lireLaListe({}, AGENT).filtres.stage_group).toBeUndefined();
  });

  it('la cible « Prospects » de « Ma journée » porte les deux filtres', () => {
    const [chemin, requete] = CIBLES_DES_CHIFFRES.prospects.split('?');
    expect(chemin).toBe('/app/customers');
    const e = lireLaListe(Object.fromEntries(new URLSearchParams(requete)), AGENT);
    expect(e.vue).toBe('mes-clients');
    expect(e.filtres).toMatchObject({ referent: 'me', stage_group: 'active' });
  });
});

describe('fetchDashboardCustomers — filter[stage_group] part à l’API', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('le filtre posé part en filter[stage_group]=active, à côté de filter[referent]=me', async () => {
    const spy = vi.fn(async (..._args: Parameters<typeof fetch>) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } }),
      text: async () => '{}',
    }));
    vi.stubGlobal('fetch', spy);
    const { fetchDashboardCustomers } = await import('@/lib/queries/customers');
    await fetchDashboardCustomers('jeton', { filters: { referent: 'me', stage_group: 'active' } });
    const url = new URL(String(spy.mock.calls[0][0]), 'http://x');
    expect(url.searchParams.get('filter[stage_group]')).toBe('active');
    expect(url.searchParams.get('filter[referent]')).toBe('me');
  });
});
