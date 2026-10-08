/**
 * TCK-595 — l'accueil client.
 *
 * AC16 : la prochaine visite et les interventions ouvertes (`maintenance.open`) sont affichées. Sans
 * aucun dossier client, l'écran invite à chercher dans la ville de l'utilisateur — par la recherche
 * publique existante — au lieu d'un état vide générique.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMeAction } from '@/app/actions/auth';
import { fetchTenantDashboard } from '@/lib/queries/dashboard';
import { rechercherBiensPublics } from '@/lib/queries/public-search';

vi.mock('next-intl/server', async () => {
  const base = (await import('@/test/intl')).mockTraductionsServeur();
  return {
    ...base,
    // Interpole les `{valeurs}` simples : le titre de l'invitation porte la ville.
    getTranslations: async (namespace?: string) => {
      const t = await base.getTranslations(namespace);
      return (cle: string, valeurs?: Record<string, string | number>) =>
        t(cle).replace(/\{(\w+)\}/g, (brut, nom: string) =>
          valeurs && nom in valeurs ? String(valeurs[nom]) : brut);
    },
  };
});
vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn() }));
vi.mock('@/lib/queries/public-search', () => ({ rechercherBiensPublics: vi.fn() }));
vi.mock('@/lib/queries/dashboard', () => ({ fetchTenantDashboard: vi.fn() }));

import TenantDashboardPage from '../tenant/page';

function tableau(avecDossier: boolean) {
  return {
    data: {
      tenant_id: 7,
      customer_id: avecDossier ? 3 : null,
      has_customer_profile: avecDossier,
      leases: { active: 0 },
      bookings: { pending: 0 },
      payments: { next_due: null, upcoming_30d: [], overdue_count: 0, overdue_amount: 0 },
      visits: {
        upcoming: avecDossier
          ? [{ id: 41, scheduled_at: '2026-07-17T10:00:00Z', status: 'scheduled', property: { id: 1, title: 'Villa Almadies' } }]
          : [],
      },
      maintenance: { open: 2 },
      documents: { recent: [] },
    },
  };
}

beforeEach(() => {
  vi.mocked(getMeAction).mockResolvedValue({ id: 7, roles: ['customer'], preferences: { city: 'Dakar', search_intent: 'rent' } } as never);
  vi.mocked(rechercherBiensPublics).mockResolvedValue({
    data: [{ id: 5, slug: 'studio-plateau', title: 'Studio Plateau', price: 150000, currency: 'XOF' }],
    facets: {},
    meta: { current_page: 1, last_page: 1, per_page: 4, total: 1 },
  } as never);
});

describe('accueil client — ce qui m’attend (AC16)', () => {
  it('affiche la prochaine visite et les interventions ouvertes', async () => {
    vi.mocked(fetchTenantDashboard).mockResolvedValue(tableau(true) as never);
    render(await TenantDashboardPage());

    expect(screen.getByRole('link', { name: /Prochaine visite.*Villa Almadies/ })).toHaveAttribute('href', '/app/visits/41');
    expect(screen.getByRole('link', { name: /Demandes d'intervention en cours\s*2/ })).toHaveAttribute('href', '/app/maintenance');
  });

  it('sans dossier : une invitation à chercher dans sa ville, nourrie par la recherche publique', async () => {
    vi.mocked(fetchTenantDashboard).mockResolvedValue(tableau(false) as never);
    render(await TenantDashboardPage());

    const requete = new URLSearchParams(vi.mocked(rechercherBiensPublics).mock.calls[0]![0]);
    expect(requete.get('city')).toBe('Dakar');
    expect(requete.get('contract_type')).toBe('rent');
    expect(screen.getByRole('heading', { name: 'Biens à Dakar pour louer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Studio Plateau/ })).toHaveAttribute('href', '/fr/properties/studio-plateau');
    expect(screen.getByRole('link', { name: 'Voir les annonces' })).toHaveAttribute('href', '/fr/properties?contract_type=rent&city=Dakar');
    expect(screen.queryByText(/Aucun profil locataire/)).toBeNull();
  });
});
