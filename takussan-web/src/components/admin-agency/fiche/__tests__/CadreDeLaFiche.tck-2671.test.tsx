import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', async () => (await import('./doublures')).navigation);
vi.mock('@/lib/queries/kyc', async () => (await import('./doublures')).KYC);

import { withIntl } from '@/test/intl';
import type { Agency } from '@/types/agency';
import type { KycDossier } from '@/types/super-admin';

import { CadreDeLaFiche } from '../CadreDeLaFiche';
import { KYC, reinitialiserLesDoublures } from './doublures';
import { AGENCE, INDIVIDUELLE } from './outils';

/**
 * TCK-2671 — la vérification et l'offre sont des PAGES, dans le cadre de la fiche (maquette
 * `app-identite-agence`, écrans 5, 8 et 9) : la tête « Mon agence », la jauge et la navigation des
 * sections, comme `/app/agency`. Hors de la fiche, un lien de section est une navigation vers
 * `/app/agency?section=…` — il n'y a pas de formulaire à garder monté.
 */

function rendre(agence: Agency, section: 'verification' | 'offre', vitrine = true, jauge = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      {withIntl(
        <CadreDeLaFiche
          agency={agence}
          vitrine={vitrine}
          origineSite="https://www.takussan.com"
          section={section}
          titre="Le titre"
          texte="Le texte"
          jauge={jauge}
        >
          <p>le contenu de la page</p>
        </CadreDeLaFiche>,
      )}
    </QueryClientProvider>,
  );
}

const navigation = () => document.querySelector<HTMLElement>('[data-slot="navigation-des-sections"]')!;

beforeEach(() => {
  reinitialiserLesDoublures();
  KYC.fetchAgencyKyc.mockResolvedValue({ data: { id: 3, status: 'pending', documents: [], expires_at: null } as unknown as KycDossier });
});

describe('CadreDeLaFiche', () => {
  it('pose la tête de la fiche, le titre de la section et le contenu de la page', () => {
    rendre(AGENCE, 'verification');
    expect(screen.getByRole('heading', { level: 1, name: 'Mon agence' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Le titre' })).toBeInTheDocument();
    expect(screen.getByText('le contenu de la page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voir ma fiche publique/ })).toHaveAttribute('href', '/agencies/dakar-immo');
  });

  it('la section de la page est la section courante ; les autres mènent à la fiche', () => {
    rendre(AGENCE, 'verification');
    const nav = within(navigation());
    expect(nav.getByRole('link', { name: /Vérification de l’agence/ })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: /Vérification de l’agence/ })).toHaveAttribute('href', '/app/agency/kyc');
    expect(nav.getByRole('link', { name: /Identité et contact/ })).toHaveAttribute('href', '/app/agency?section=identite');
    expect(nav.getByRole('link', { name: /Identité et contact/ })).not.toHaveAttribute('aria-current');
    expect(nav.getByRole('link', { name: /Offre et passage en pro/ })).toHaveAttribute('href', '/app/settings/agency/upgrade');
  });

  it('une agence individuelle : « Passage en pro », « Facturation », sans « Menu de l’équipe »', () => {
    rendre(INDIVIDUELLE, 'offre');
    const nav = within(navigation());
    expect(nav.getByRole('link', { name: /Passage en pro/ })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: /^Facturation/ })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: /Menu de l’équipe/ })).toBeNull();
    expect(nav.queryByRole('link', { name: /Offre et passage en pro/ })).toBeNull();
  });

  it('sans la vitrine, pas de « Fiche publique »', () => {
    rendre(AGENCE, 'offre', false);
    expect(within(navigation()).queryByRole('link', { name: /Fiche publique/ })).toBeNull();
  });

  it('la jauge se calcule comme dans la fiche, et ses liens ouvrent le champ dans la fiche', async () => {
    rendre(AGENCE, 'offre', true, true);
    await waitFor(() => expect(document.querySelector('[data-slot="jauge-de-la-fiche"]')).not.toBeNull());
    const jauge = within(document.querySelector<HTMLElement>('[data-slot="jauge-de-la-fiche"]')!);
    expect(jauge.getByText(/Fiche complète à \d+ %/)).toBeInTheDocument();
    const lien = jauge.getAllByRole('link').find((a) => a.getAttribute('href')?.startsWith('/app/agency?section='));
    expect(lien, 'aucun lien vers un champ de la fiche').toBeDefined();
    expect(lien!.getAttribute('href')).toMatch(/^\/app\/agency\?section=[a-z]+(#field-[\w.]+)?$/);
  });

  it('sans `jauge`, pas de jauge : la maquette n’en pose ni sur la vérification (a-5) ni sur le passage en pro de l’hôte (a-9)', async () => {
    rendre(AGENCE, 'verification');
    // La lecture du dossier est faite : la navigation porte l'état de chaque section.
    await waitFor(() => expect(within(navigation()).getAllByRole('img').length).toBeGreaterThan(0));
    expect(screen.getByText('le contenu de la page')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="jauge-de-la-fiche"]')).toBeNull();
    expect(screen.queryByText(/Fiche complète à/)).toBeNull();
  });
});
