import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2628 (AC2, ADR-0096 § 4) — les sept anciennes adresses de `/app/overview` ne rendent plus qu'une
 * redirection, vers l'onglet équivalent de « Rapports ». Remplace `aiguillage.test.ts` (TCK-379, TCK-595,
 * TCK-2260, TCK-2625) : l'aiguillage par rôle est devenu la vue d'ensemble par persona, et la garde de la vue
 * du bailleur (TCK-2260) vit dans `garderLaVueDEnsemble` (`lib/rapports/__tests__/gardes-serveur`).
 *
 * Les pages sont EXÉCUTÉES ; seul le contexte (persona, pages d'administration, capacités) est simulé. La table
 * complète des cibles est jugée par `cibleDeLAncienneAdresse` (`lib/navigation/__tests__/rapports`) ; ce test
 * garde le câblage de chaque page : l'adresse qu'elle nomme et les paramètres qu'elle transmet.
 */
class RedirectionSimulee extends Error {
  constructor(readonly cible: string) {
    super(`NEXT_REDIRECT:${cible}`);
  }
}
vi.mock('next/navigation', () => ({
  redirect: (cible: string) => {
    throw new RedirectionSimulee(cible);
  },
}));
const contexte = vi.hoisted(() => ({ valeur: {} as Record<string, unknown> }));
vi.mock('@/lib/rapports/contexte-serveur', () => ({ lireLeContexteDesRapports: async () => contexte.valeur }));

const ADMIN = { persona: 'admin-agence', modulesMasques: [], cheminsAdmin: ['/app/agency/team', '/app/agency/finances'], capacites: ['reports.view_agency'] };
const AGENT = { persona: 'agent', modulesMasques: [], cheminsAdmin: [], capacites: ['reports.view_agency'] };

type Page = (props: { searchParams: Promise<{ scope?: string }> }) => Promise<never>;
const PAGES: Record<string, () => Promise<{ default: Page }>> = {
  '/app/overview': () => import('../page') as never,
  '/app/overview/agency': () => import('../agency/page') as never,
  '/app/overview/agent': () => import('../agent/page') as never,
  '/app/overview/owner': () => import('../owner/page') as never,
  '/app/overview/kpis': () => import('../kpis/page') as never,
  '/app/overview/alerts': () => import('../alerts/page') as never,
  '/app/overview/exports': () => import('../exports/page') as never,
};

async function cibleDe(adresse: string, params: { scope?: string } = {}): Promise<string> {
  const { default: page } = await PAGES[adresse]!();
  try {
    await page({ searchParams: Promise.resolve(params) });
  } catch (e) {
    if (e instanceof RedirectionSimulee) return e.cible;
    throw e;
  }
  throw new Error(`${adresse} n’a redirigé nulle part`);
}

beforeEach(() => {
  contexte.valeur = ADMIN;
});

describe('TCK-2628 — les anciennes adresses de /app/overview', () => {
  it('l’admin : chaque adresse mène à l’onglet équivalent', async () => {
    expect(await cibleDe('/app/overview')).toBe('/app/reports');
    expect(await cibleDe('/app/overview/agency')).toBe('/app/reports');
    expect(await cibleDe('/app/overview/kpis')).toBe('/app/reports/indicators');
    expect(await cibleDe('/app/overview/alerts')).toBe('/app/reports/alerts');
    expect(await cibleDe('/app/overview/exports')).toBe('/app/reports/exports');
  });

  it('le bailleur : /app/overview/owner mène à sa vue d’ensemble', async () => {
    contexte.valeur = { persona: 'bailleur', modulesMasques: [], cheminsAdmin: [], capacites: [] };
    expect(await cibleDe('/app/overview/owner')).toBe('/app/reports');
  });

  it('AC2 — /app/overview/agent?scope=agency → /app/reports?scope=agency ; sans portée, la vue « Moi »', async () => {
    contexte.valeur = AGENT;
    expect(await cibleDe('/app/overview/agent', { scope: 'agency' })).toBe('/app/reports?scope=agency');
    expect(await cibleDe('/app/overview/agent')).toBe('/app/reports');
    expect(await cibleDe('/app/overview', { scope: 'agency' })).toBe('/app/reports?scope=agency');
  });

  it('TCK-379 — le prestataire est ramené à /app, jamais sur une vue qui n’est pas la sienne', async () => {
    contexte.valeur = { persona: 'prestataire', modulesMasques: [], cheminsAdmin: [], capacites: [] };
    for (const adresse of Object.keys(PAGES)) expect(await cibleDe(adresse)).toBe('/app');
  });

  it('TCK-2625 — locataire et client vont à l’accueil, qui porte leur vue', async () => {
    for (const persona of ['locataire', 'client']) {
      contexte.valeur = { persona, modulesMasques: [], cheminsAdmin: [], capacites: [] };
      expect(await cibleDe('/app/overview')).toBe('/app');
    }
  });
});
