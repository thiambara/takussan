import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContexteServeurDesRapports } from '../contexte-serveur';

const etat = vi.hoisted(() => ({
  contexte: null as unknown as ContexteServeurDesRapports,
  agence: null as { kind: string } | null,
  vueBailleur: true as boolean | null,
  pageAdminRefusee: null as string | null,
  pagesJugees: [] as string[],
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('../contexte-serveur', () => ({ lireLeContexteDesRapports: async () => etat.contexte }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  ROUTE_VERIF_INDISPONIBLE: '/verification-indisponible',
  resolveAgencyOrNull: vi.fn(async (_t: string, _id: number, _ou: string, usage: string) => {
    expect(usage).toBe('decision');
    return etat.agence;
  }),
}));
vi.mock('@/lib/access/tableau-du-bailleur', () => ({
  vueBailleurOuverte: async () => etat.vueBailleur,
  repliDeLaVueBailleur: async () => '/app/agency',
}));
vi.mock('@/lib/access/pages-admin-server', () => ({
  garderPageAdmin: async (chemin: string) => {
    etat.pagesJugees.push(chemin);
    if (etat.pageAdminRefusee) throw new Error(`NEXT_REDIRECT:${etat.pageAdminRefusee}`);
  },
}));

const gardes = await import('../gardes-serveur');

const ADMIN: ContexteServeurDesRapports = {
  user: { id: 1, roles: ['agency_admin'], agency_id: 7 } as never,
  persona: 'admin-agence',
  modulesMasques: [],
  cheminsAdmin: ['/app/agency', '/app/agency/team', '/app/agency/finances'],
  capacites: ['reports.view_agency'],
};
const AGENT: ContexteServeurDesRapports = { ...ADMIN, user: { id: 2, roles: ['agent'], agency_id: 7 } as never, persona: 'agent', cheminsAdmin: [], capacites: [] };
const BAILLEUR: ContexteServeurDesRapports = { ...ADMIN, user: { id: 3, roles: ['owner'], agency_id: 7 } as never, persona: 'bailleur', cheminsAdmin: [], capacites: [] };
const LOCATAIRE: ContexteServeurDesRapports = { ...ADMIN, user: { id: 4, roles: ['customer', 'tenant'] } as never, persona: 'locataire', cheminsAdmin: [], capacites: [] };

async function redirection(promesse: Promise<unknown>): Promise<string | null> {
  try {
    await promesse;
    return null;
  } catch (e) {
    const m = /^NEXT_REDIRECT:(.*)$/.exec((e as Error).message);
    if (!m) throw e;
    return m[1];
  }
}

beforeEach(() => {
  etat.contexte = ADMIN;
  etat.agence = { kind: 'standard' };
  etat.vueBailleur = true;
  etat.pageAdminRefusee = null;
  etat.pagesJugees = [];
});

describe('TCK-2628 — la section', () => {
  it('AC6 — locataire : /app, pour la section, la vue d’ensemble et chaque onglet', async () => {
    etat.contexte = LOCATAIRE;
    expect(await redirection(gardes.garderLesRapports())).toBe('/app');
    expect(await redirection(gardes.garderLaVueDEnsemble())).toBe('/app');
    expect(await redirection(gardes.garderLOnglet('exports'))).toBe('/app');
  });
});

describe('TCK-2628 — la vue d’ensemble garde les gardes des vues qu’elle remplace', () => {
  it('admin : agence `standard` lue en décision ; individuelle ou illisible → /app', async () => {
    expect(await redirection(gardes.garderLaVueDEnsemble())).toBeNull();
    etat.agence = { kind: 'individual' };
    expect(await redirection(gardes.garderLaVueDEnsemble())).toBe('/app');
    etat.agence = null;
    expect(await redirection(gardes.garderLaVueDEnsemble())).toBe('/app');
  });

  it('super-admin sans agence : passe (la vue dit qu’il n’en a pas)', async () => {
    etat.contexte = { ...ADMIN, persona: 'plateforme', user: { id: 9, roles: ['super_admin'], agency_id: null } as never };
    etat.agence = null;
    expect(await redirection(gardes.garderLaVueDEnsemble())).toBeNull();
  });

  it('bailleur : `vueBailleurOuverte` — fermée → le repli, illisible → vérification indisponible', async () => {
    etat.contexte = BAILLEUR;
    expect(await redirection(gardes.garderLaVueDEnsemble())).toBeNull();
    etat.vueBailleur = false;
    expect(await redirection(gardes.garderLaVueDEnsemble())).toBe('/app/agency');
    etat.vueBailleur = null;
    expect(await redirection(gardes.garderLaVueDEnsemble())).toBe('/verification-indisponible');
  });
});

describe('TCK-2628 — les onglets', () => {
  it('un onglet absent de la persona mène à la vue d’ensemble, sans juger de page d’administration', async () => {
    etat.contexte = AGENT;
    expect(await redirection(gardes.garderLOnglet('equipe'))).toBe('/app/reports');
    expect(await redirection(gardes.garderLOnglet('alertes'))).toBe('/app/reports');
    expect(etat.pagesJugees).toEqual([]);
  });

  it('`analytics` masqué : l’adresse d’un onglet caché s’ouvre — aucune garde ne lit le masque (ADR-0089)', async () => {
    etat.contexte = { ...ADMIN, modulesMasques: ['analytics'] };
    expect(await redirection(gardes.garderLOnglet('exports'))).toBeNull();
    expect(await redirection(gardes.garderLOnglet('alertes'))).toBeNull();
    expect(await redirection(gardes.garderLesIndicateurs())).toBeNull();
  });

  it('les indicateurs : l’admin et l’hôte ; pas l’agent ni le bailleur', async () => {
    expect(await redirection(gardes.garderLesIndicateurs())).toBeNull();
    etat.contexte = AGENT;
    expect(await redirection(gardes.garderLesIndicateurs())).toBe('/app/reports');
    etat.contexte = BAILLEUR;
    expect(await redirection(gardes.garderLesIndicateurs())).toBe('/app/reports');
  });

  it('Équipe : la garde de /app/agency/team, PUIS `reports.view_agency`', async () => {
    expect(await redirection(gardes.garderLOnglet('equipe'))).toBeNull();
    expect(etat.pagesJugees).toEqual(['/app/agency/team']);
    etat.pageAdminRefusee = '/app/agency';
    expect(await redirection(gardes.garderLOnglet('equipe'))).toBe('/app/agency');
    etat.pageAdminRefusee = null;
    etat.contexte = { ...ADMIN, capacites: [] };
    expect(await redirection(gardes.garderLOnglet('equipe'))).toBe('/app/reports');
    etat.contexte = { ...ADMIN, capacites: null };
    expect(await redirection(gardes.garderLOnglet('equipe'))).toBe('/verification-indisponible');
  });

  it('Impayés : la garde de /app/agency/finances', async () => {
    expect(await redirection(gardes.garderLOnglet('impayes'))).toBeNull();
    expect(etat.pagesJugees).toEqual(['/app/agency/finances']);
  });

  it('Reversements : la garde de la vue du bailleur', async () => {
    etat.contexte = BAILLEUR;
    expect(await redirection(gardes.garderLOnglet('reversements'))).toBeNull();
    etat.vueBailleur = false;
    expect(await redirection(gardes.garderLOnglet('reversements'))).toBe('/app/agency');
  });
});

describe('TCK-2628 — les anciennes adresses', () => {
  it('AC2 — /app/overview/agent?scope=agency → la vue d’ensemble de l’agent, portée gardée', async () => {
    etat.contexte = AGENT;
    expect(await gardes.cibleServeurDeLAncienneAdresse('/app/overview/agent', Promise.resolve({ scope: 'agency' }))).toBe(
      '/app/reports?scope=agency',
    );
  });

  it('AC3 — `analytics` masqué : /app/overview/alerts → la vue d’ensemble', async () => {
    etat.contexte = { ...ADMIN, modulesMasques: ['analytics'] };
    expect(await gardes.cibleServeurDeLAncienneAdresse('/app/overview/alerts')).toBe('/app/reports');
  });

  it('AC6 — locataire : /app/overview → /app', async () => {
    etat.contexte = LOCATAIRE;
    expect(await gardes.cibleServeurDeLAncienneAdresse('/app/overview')).toBe('/app');
  });
});
