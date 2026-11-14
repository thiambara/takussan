/**
 * TCK-2801 — la tête de « Rapports » (fiche TCK-2628, O2 et O3) : la description « <nom> · du 1 au 30 novembre
 * 2026 », « Exporter » vers l'onglet Exports, et la pastille du compte des impayés sur l'onglet Impayés.
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const navigation = vi.hoisted(() => ({ chemin: '/app/reports', requete: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.chemin,
  useSearchParams: () => new URLSearchParams(navigation.requete),
}));

const historique = vi.hoisted(() => ({ etat: { data: undefined as unknown, isError: false }, appels: [] as unknown[] }));
vi.mock('@/lib/queries/payments', () => ({
  usePaymentsHistory: (params: unknown) => {
    historique.appels.push(params);
    return historique.etat;
  },
}));

const { OngletsDesRapports } = await import('../OngletsDesRapports');
const { ongletsDesRapports } = await import('@/lib/navigation/rapports');
const { DescriptionDesRapports, ExporterLeRapport } = await import('../TeteDesRapports');

const ADMIN = [
  { id: 'ensemble', libelle: 'Vue d’ensemble' },
  { id: 'equipe', libelle: 'Équipe' },
  { id: 'impayes', libelle: 'Impayés' },
  { id: 'exports', libelle: 'Exports' },
  { id: 'alertes', libelle: 'Alertes' },
] as const;

const lienImpayes = () =>
  within(screen.getByRole('navigation', { name: 'Sections' }))
    .getAllByRole('link')
    .find((a) => a.getAttribute('href') === '/app/reports/unpaid') as HTMLElement;

beforeEach(() => {
  navigation.chemin = '/app/reports';
  navigation.requete = '';
  historique.etat = { data: undefined, isError: false };
  historique.appels = [];
});

describe('TCK-2801 — AC3 : la pastille d’Impayés', () => {
  it('le compte de la règle de l’onglet (`days_late_min=1`, `per_page=1`) : « Impayés 16 », dit en mots au lecteur d’écran', () => {
    historique.etat = { data: { meta: { total: 16 } }, isError: false };
    render(withIntl(<OngletsDesRapports onglets={ADMIN} aria="Sections" />));
    expect(historique.appels[0]).toMatchObject({ days_late_min: 1, per_page: 1, page: 1 });
    const pastille = lienImpayes().querySelector('[data-slot="pastille-d-onglet"]');
    expect(pastille?.textContent).toBe('16');
    expect(pastille?.getAttribute('aria-hidden')).toBe('true');
    expect(lienImpayes().textContent).toBe('Impayés16, 16 échéances impayées');
  });

  it('lecture en échec ou en cours : aucune pastille, jamais « 0 » à la place d’un compte absent', () => {
    // Une relecture en échec garde la donnée d'avant dans TanStack : l'échec l'emporte, aucune pastille.
    historique.etat = { data: { meta: { total: 16 } }, isError: true };
    const { unmount } = render(withIntl(<OngletsDesRapports onglets={ADMIN} aria="Sections" />));
    expect(lienImpayes().textContent).toBe('Impayés');
    unmount();
    historique.etat = { data: undefined, isError: false };
    render(withIntl(<OngletsDesRapports onglets={ADMIN} aria="Sections" />));
    expect(lienImpayes().textContent).toBe('Impayés');
  });

  it('aucune échéance : pas de pastille', () => {
    historique.etat = { data: { meta: { total: 0 } }, isError: false };
    render(withIntl(<OngletsDesRapports onglets={ADMIN} aria="Sections" />));
    expect(lienImpayes().querySelector('[data-slot="pastille-d-onglet"]')).toBeNull();
  });

  // Consigne de team-lead (2026-11-14) : la pastille ne s'affiche et ne lit l'API QUE si la persona ouvre l'onglet
  // Impayés, par la même garde que lui — les onglets passent par `ongletsDesRapports`, comme dans le layout.
  it('même garde que l’onglet : sans Impayés ouvert (page d’origine fermée, agent, bailleur, plateforme), aucune pastille ni lecture', () => {
    historique.etat = { data: { meta: { total: 16 } }, isError: false };
    const libelles = (ids: readonly string[]) => ids.map((id) => ({ id, libelle: id })) as never;
    const ADMIN_PAGES = ['/app/agency/team', '/app/agency/finances'];
    const ouverts = ongletsDesRapports({ persona: 'admin-agence', cheminsAdmin: ADMIN_PAGES, capacites: ['reports.view_agency'] });
    expect(ouverts).toContain('impayes');
    const { unmount } = render(withIntl(<OngletsDesRapports onglets={libelles(ouverts)} aria="Sections" />));
    expect(historique.appels).toHaveLength(1);
    unmount();
    for (const contexte of [
      { persona: 'admin-agence' as const, cheminsAdmin: ['/app/agency/team'], capacites: ['reports.view_agency'] },
      { persona: 'agent' as const },
      { persona: 'bailleur' as const },
      { persona: 'plateforme' as const },
    ]) {
      historique.appels = [];
      const ids = ongletsDesRapports(contexte);
      expect(ids).not.toContain('impayes');
      const r = render(withIntl(<OngletsDesRapports onglets={libelles(ids)} aria="Sections" />));
      expect(historique.appels, contexte.persona).toEqual([]);
      expect(document.querySelector('[data-slot="pastille-d-onglet"]')).toBeNull();
      r.unmount();
    }
  });
});

describe('TCK-2801 — AC2 : la description et « Exporter »', () => {
  it('l’agence et le mois en mois longs', () => {
    render(withIntl(<DescriptionDesRapports nom="Dakar Immo" periode="du 1 au 30 novembre 2026" />));
    expect(screen.getByText('Dakar Immo · du 1 au 30 novembre 2026')).toBeTruthy();
  });

  it('l’agent : son nom en portée « Moi », l’agence en portée « Agence »', () => {
    const { unmount } = render(withIntl(<DescriptionDesRapports nom="Sokhna Sène" nomDeLAgence="Dakar Immo" periode="du 1 au 30 novembre 2026" />));
    expect(screen.getByText(/^Sokhna Sène · /)).toBeTruthy();
    unmount();
    navigation.requete = 'scope=agency';
    render(withIntl(<DescriptionDesRapports nom="Sokhna Sène" nomDeLAgence="Dakar Immo" periode="du 1 au 30 novembre 2026" />));
    expect(screen.getByText(/^Dakar Immo · /)).toBeTruthy();
  });

  it('« Exporter » mène à l’onglet Exports', () => {
    render(withIntl(<ExporterLeRapport libelle="Exporter" />));
    expect(screen.getByRole('link', { name: 'Exporter' }).getAttribute('href')).toBe('/app/reports/exports');
  });
});
