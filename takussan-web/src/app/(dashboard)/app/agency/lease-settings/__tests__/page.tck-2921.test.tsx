import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * TCK-2921 (ADR-0111, AC4) — la page des réglages de bail s'ouvre au personnel de l'agence : elle ne
 * renvoie plus qui ne configure pas l'agence (l'état lecture se décide sur `can_edit`, dans
 * `ReglagesDeBail`). Qui n'ouvre pas « Mon agence » (l'agent) n'a ni la navigation des sections ni
 * `/app/agency` pour repli ; venu du bail (`?depuis=bail`), le retour descend à la section et le repli
 * du téléphone est le bail.
 */
const ETAT = vi.hoisted(() => ({
  roles: ['agent', 'customer'] as string[],
  capacites: [] as readonly string[] | null,
  chemins: ['/app/agency/lease-settings'] as string[],
}));

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ETAT.roles, agency_id: 7 }) }));
vi.mock('@/lib/access/pages-admin-server', () => ({
  garderPageAdmin: async () => undefined,
  capacitesDuProfilActif: async () => ETAT.capacites,
  accesAdmin: async () => ({ chemins: ETAT.chemins, espaceIndividuel: false }),
}));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: async () => ({ id: 7, name: 'Dakar Immo', slug: 'dakar-immo', kind: 'standard', primary_admin_id: 99, settings: {} }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/config-publique', () => ({ origineSite: () => 'https://takussan.test' }));
vi.mock('@/components/admin-agency/fiche/CadreDeLaFiche', () => ({
  CadreDeLaFiche: ({ navigation, repli, children }: { navigation?: boolean; repli?: string; children: React.ReactNode }) => (
    <div data-testid="cadre" data-navigation={String(navigation)} data-repli={repli}>
      {children}
    </div>
  ),
}));
vi.mock('@/components/admin-agency/reglages-de-bail/ReglagesDeBail', () => ({
  ReglagesDeBail: ({ retour }: { retour?: unknown }) => <div data-testid="reglages" data-retour={JSON.stringify(retour ?? null)} />,
}));

const cadre = () => screen.getByTestId('cadre');

describe('/app/agency/lease-settings — ouverte au personnel (TCK-2921)', () => {
  beforeEach(() => {
    ETAT.roles = ['agent', 'customer'];
    ETAT.capacites = [];
    ETAT.chemins = ['/app/agency/lease-settings'];
  });

  it('un agent n’est pas renvoyé : la section, sans navigation, repli /app', async () => {
    const { default: Page } = await import('../page');
    render(await Page());
    expect(screen.getByTestId('reglages')).toHaveAttribute('data-retour', 'null');
    expect(cadre()).toHaveAttribute('data-navigation', 'false');
    expect(cadre()).toHaveAttribute('data-repli', '/app');
  });

  it('un admin qui ne configure pas l’agence la lit aussi, avec la navigation de « Mon agence »', async () => {
    ETAT.roles = ['agency_admin', 'customer'];
    ETAT.capacites = ['team.invite'];
    ETAT.chemins = ['/app/agency/team', '/app/agency', '/app/agency/lease-settings'];
    const { default: Page } = await import('../page');
    render(await Page());
    expect(cadre()).toHaveAttribute('data-navigation', 'true');
    expect(cadre()).toHaveAttribute('data-repli', '/app/agency');
  });

  it('venu du bail : le retour descend à la section, le repli du téléphone est le bail', async () => {
    ETAT.roles = ['agency_admin', 'customer'];
    ETAT.capacites = ['agency.update'];
    ETAT.chemins = ['/app/agency', '/app/agency/lease-settings'];
    const { default: Page } = await import('../page');
    render(await Page({ searchParams: Promise.resolve({ depuis: 'bail', property: '11', locataire: '7' }) }));
    expect(JSON.parse(screen.getByTestId('reglages').getAttribute('data-retour')!)).toEqual({ propertyId: 11, locataireId: 7 });
    expect(cadre()).toHaveAttribute('data-repli', '/app/leases/new?property=11');
  });
});
