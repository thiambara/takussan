import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { AgencySubscription } from '@/types/super-admin';

/**
 * TCK-2671 — la page Abonnement porte en tête le bloc prix et jauges.
 *
 * - AC3 : avec un plan à 65 000 en base, la page lit « 65 000 F CFA / mois » — le prix vient de
 *   l'API, jamais du code (le montant n'apparaît ici que comme DONNÉE simulée).
 * - AC5 : « Biens en ligne {used} sur {limit} » et « Agents {used} sur {limit} » égaux à
 *   `GET /api/me/quota` ; les succursales n'ont que leur limite, sans jauge.
 */

const mockResolveAgency = vi.fn();
const mockAbonnement = vi.fn();
const mockQuota = vi.fn();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agency_admin'], agency_id: 7 }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({ resolveAgencyOrNull: (...a: unknown[]) => mockResolveAgency(...a) }));
vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: async () => undefined }));
vi.mock('@/lib/queries/offre', () => ({
  fetchAbonnement: (...a: unknown[]) => mockAbonnement(...a),
  fetchQuotaDeLAgence: (...a: unknown[]) => mockQuota(...a),
}));
vi.mock('@/components/billing/AgencyBillingClient', () => ({ AgencyBillingClient: () => <div data-testid="bloc-abonnement" /> }));
vi.mock('@/components/billing/AgencyPayoutsClient', () => ({ AgencyPayoutsClient: () => <div data-testid="bloc-reversements" /> }));

import Page from '../page';

const abonnement = (prix: number): AgencySubscription => ({
  id: 3,
  agency_id: 7,
  plan_id: 2,
  status: 'active',
  trial_ends_at: null,
  current_period_start: '2026-11-01T00:00:00Z',
  current_period_end: '2026-12-01T00:00:00Z',
  ended_at: null,
  platform_fee_pct_override: null,
  limits_override: {},
  effective_platform_fee_pct: 3,
  effective_limits: { max_active_listings: 100, max_agents: 15, max_branches: 3 },
  plan: {
    id: 2,
    code: 'pro',
    label: 'Offre Pro',
    description: null,
    monthly_price_xof: prix,
    platform_fee_pct: 3,
    trial_days: 0,
    limits: {},
    is_active: true,
    sort_order: 1,
    created_at: null,
    updated_at: null,
  },
  created_at: null,
  updated_at: null,
});

const texte = (el: Element | null) => (el?.textContent ?? '').replace(/[  ]/g, ' ');

describe('/app/agency/billing — le bloc prix et jauges (TCK-2671)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAgency.mockResolvedValue({ id: 7, kind: 'standard' });
    mockAbonnement.mockResolvedValue(abonnement(65000));
    mockQuota.mockResolvedValue({ biens: { limit: 100, used: 67 }, agents: { limit: 15, used: 9 } });
  });

  it('AC3 — le prix est celui du plan, en F CFA, par mois', async () => {
    render(withIntl(await Page()));
    const bloc = screen.getByRole('region', { name: 'Offre Pro' });
    expect(texte(bloc)).toContain('65 000 F CFA / mois');
    expect(texte(bloc)).toContain('et 3 % sur les paiements encaissés en ligne.');
    expect(texte(bloc)).not.toMatch(/engagement/i);
    // Sur la page Abonnement elle-même, pas de lien vers elle-même.
    expect(screen.queryByRole('link', { name: 'Abonnement et factures' })).not.toBeInTheDocument();
  });

  it('AC5 — les jauges sont celles de /api/me/quota ; les succursales, leur limite seule', async () => {
    render(withIntl(await Page()));
    const bloc = screen.getByRole('region', { name: 'Offre Pro' });
    const valeurDe = (libelle: string) => texte(screen.getByText(libelle).nextElementSibling);
    expect(valeurDe('Biens en ligne')).toBe('67 sur 100');
    expect(valeurDe('Agents')).toBe('9 sur 15');
    expect(valeurDe('Succursales')).toBe('jusqu’à 3');
    // Deux barres, aucune pour les succursales.
    expect(bloc.querySelectorAll('dd[aria-hidden="true"]')).toHaveLength(2);
  });

  it('une limite nulle se lit « Illimité », sans barre', async () => {
    mockQuota.mockResolvedValue({ biens: { limit: null, used: 214 }, agents: { limit: 15, used: 9 } });
    render(withIntl(await Page()));
    expect(texte(screen.getByText('Biens en ligne').nextElementSibling)).toBe('214 · Illimité');
    expect(screen.getByRole('region', { name: 'Offre Pro' }).querySelectorAll('dd[aria-hidden="true"]')).toHaveLength(1);
  });

  it('la consommation illisible se dit, le prix reste', async () => {
    mockQuota.mockRejectedValue(new Error('réseau'));
    render(withIntl(await Page()));
    const bloc = screen.getByRole('region', { name: 'Offre Pro' });
    expect(texte(bloc)).toContain('65 000 F CFA');
    expect(texte(bloc)).toContain('Votre consommation n’a pas pu être lue.');
  });

  it("une agence individuelle n'a pas le bloc ; l'abonnement n'est pas lu", async () => {
    mockResolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    render(withIntl(await Page()));
    expect(screen.queryByRole('region', { name: 'Offre Pro' })).not.toBeInTheDocument();
    expect(mockAbonnement).not.toHaveBeenCalled();
  });
});
