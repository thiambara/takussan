import { beforeEach, describe, expect, it, vi } from 'vitest';

const etat = vi.hoisted(() => ({
  user: null as unknown as Record<string, unknown>,
  agence: null as { kind: string; settings?: unknown } | null,
  espaceIndividuel: false,
  chemins: [] as string[],
  capacites: [] as string[] | null,
  cookie: undefined as string | undefined,
  lecturesDAgence: 0,
}));

vi.mock('react', async (importOriginal) => ({ ...(await importOriginal<typeof import('react')>()), cache: <T,>(f: T) => f }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => etat.user }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton', getActiveProfileId: async () => etat.cookie }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: async () => {
    etat.lecturesDAgence += 1;
    return etat.agence;
  },
}));
vi.mock('@/lib/access/pages-admin-server', () => ({
  accesAdmin: async () => ({ chemins: etat.chemins, espaceIndividuel: etat.espaceIndividuel }),
  capacitesDuProfilActif: async () => etat.capacites,
}));

const { lireLeContexteDesRapports } = await import('../contexte-serveur');

beforeEach(() => {
  etat.agence = { kind: 'standard', settings: {} };
  etat.espaceIndividuel = false;
  etat.chemins = [];
  etat.capacites = [];
  etat.cookie = undefined;
  etat.lecturesDAgence = 0;
});

describe('TCK-2628 — la persona de « Rapports » est celle de la coque', () => {
  it('admin d’une agence `standard` : admin-agence, avec ses pages d’administration et ses capacités', async () => {
    etat.user = { id: 1, roles: ['customer', 'agency_admin'], agency_id: 7 };
    etat.chemins = ['/app/agency/team'];
    etat.capacites = ['reports.view_agency'];
    const ctx = await lireLeContexteDesRapports();
    expect([ctx.persona, ctx.cheminsAdmin, ctx.capacites]).toEqual(['admin-agence', ['/app/agency/team'], ['reports.view_agency']]);
  });

  it('admin d’une agence `individual` : l’hôte', async () => {
    etat.user = { id: 1, roles: ['customer', 'agency_admin', 'owner'], agency_id: 7 };
    etat.agence = { kind: 'individual' };
    expect((await lireLeContexteDesRapports()).persona).toBe('hote');
  });

  it('`espaceIndividuel` d’`accesAdmin` suffit, comme dans la coque', async () => {
    etat.user = { id: 1, roles: ['customer', 'agency_admin'], agency_id: 7 };
    etat.agence = null;
    etat.espaceIndividuel = true;
    expect((await lireLeContexteDesRapports()).persona).toBe('hote');
  });

  it('le profil actif décide : admin et bailleur — bailleur par défaut (ordre de l’API), admin sous son profil', async () => {
    etat.user = { id: 1, roles: ['customer', 'agency_admin', 'owner'], agency_id: 7 };
    expect((await lireLeContexteDesRapports()).persona).toBe('bailleur');
    etat.cookie = 'agency_admin:7';
    expect((await lireLeContexteDesRapports()).persona).toBe('admin-agence');
  });

  it('les modules masqués de l’agence du profil actif', async () => {
    etat.user = { id: 2, roles: ['customer', 'agent'], agency_id: 7 };
    etat.agence = { kind: 'standard', settings: { hidden_modules: ['analytics'] } };
    const ctx = await lireLeContexteDesRapports();
    expect([ctx.persona, ctx.modulesMasques]).toEqual(['agent', ['analytics']]);
  });

  it('locataire : aucune lecture d’agence', async () => {
    etat.user = { id: 4, roles: ['customer', 'tenant'], agency_id: null };
    expect((await lireLeContexteDesRapports()).persona).toBe('locataire');
    expect(etat.lecturesDAgence).toBe(0);
  });
});
