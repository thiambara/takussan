import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ chemin: '/app/reports', requete: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.chemin,
  useSearchParams: () => new URLSearchParams(navigation.requete),
}));

const { OngletsDesRapports } = await import('../OngletsDesRapports');

const AGENT = [
  { id: 'ensemble', libelle: 'Vue d’ensemble' },
  { id: 'commissions', libelle: 'Commissions' },
  { id: 'pipeline', libelle: 'Pipeline' },
  { id: 'exports', libelle: 'Exports' },
] as const;

function liens() {
  return within(screen.getByRole('navigation', { name: 'Sections du rapport' })).getAllByRole('link');
}

describe('TCK-2628 — la barre d’onglets de « Rapports »', () => {
  beforeEach(() => {
    navigation.chemin = '/app/reports';
    navigation.requete = '';
  });

  it('un lien par onglet ouvert, dans l’ordre reçu, une URL chacun', () => {
    render(<OngletsDesRapports onglets={AGENT} aria="Sections du rapport" />);
    expect(liens().map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Vue d’ensemble', '/app/reports'],
      ['Commissions', '/app/reports/commissions'],
      ['Pipeline', '/app/reports/pipeline'],
      ['Exports', '/app/reports/exports'],
    ]);
  });

  it('l’onglet de l’adresse est la page courante, et lui seul', () => {
    navigation.chemin = '/app/reports/pipeline';
    render(<OngletsDesRapports onglets={AGENT} aria="Sections du rapport" />);
    expect(liens().filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)).toEqual(['Pipeline']);
  });

  it('la page des indicateurs n’allume aucun onglet', () => {
    navigation.chemin = '/app/reports/indicators';
    render(<OngletsDesRapports onglets={AGENT} aria="Sections du rapport" />);
    expect(liens().some((a) => a.hasAttribute('aria-current'))).toBe(false);
  });

  it('AC2 — l’agent en portée « Agence » : la portée suit ensemble, commissions et pipeline', () => {
    navigation.requete = 'scope=agency';
    render(<OngletsDesRapports onglets={AGENT} aria="Sections du rapport" transmetLaPortee />);
    expect(liens().map((a) => a.getAttribute('href'))).toEqual([
      '/app/reports?scope=agency',
      '/app/reports/commissions?scope=agency',
      '/app/reports/pipeline?scope=agency',
      '/app/reports/exports',
    ]);
  });

  it('sans `transmetLaPortee` (une autre persona), la portée de l’adresse n’est pas recopiée', () => {
    navigation.requete = 'scope=agency';
    render(<OngletsDesRapports onglets={AGENT} aria="Sections du rapport" />);
    expect(liens()[0].getAttribute('href')).toBe('/app/reports');
  });

  it('44 px d’appui au téléphone (h-11)', () => {
    render(<OngletsDesRapports onglets={AGENT} aria="Sections du rapport" />);
    for (const a of liens()) expect(a.className).toMatch(/\bh-11\b/);
  });
});
