/**
 * TCK-2671 — la page « Offre et passage en pro », par profil.
 *
 * - Agence `standard` : « déjà professionnelle », le prix de son plan et ses jauges, ce que le
 *   passage a ouvert ; un abonnement illisible se dit à sa place.
 * - Hôte `individual` : l'état de la dernière demande D'ABORD (AC4 : le motif est le premier bloc),
 *   le prix lu de l'API (AC3 : « 65 000 F CFA / mois », décision 14), le formulaire prérempli des
 *   mentions légales ; une demande refusée est reprise ; une demande en cours ferme le formulaire.
 * - Une liste illisible est un état d'erreur, jamais le formulaire vide.
 * (Le refus d'un autre profil vit dans `layout.tsx`, TCK-426.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { AgencyUpgradeRequest } from '@/types/agency-upgrade';

const mockAgence = vi.fn();
const mockListe = vi.fn();
const mockOffre = vi.fn();
const mockAbonnement = vi.fn();
const mockQuota = vi.fn();
const propsDuFormulaire = vi.fn();

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ id: 1, roles: ['agency_admin'], agency_id: 4 }) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: async () => ['agency.update'] }));
// Le cadre de la fiche (tête, jauge, navigation) a son propre test : ici, sa section et son titre.
vi.mock('@/components/admin-agency/fiche/CadreDeLaFiche', () => ({
  CadreDeLaFiche: ({ section, titre, jauge, children }: { section: string; titre: string; jauge?: boolean; children: React.ReactNode }) => (
    <div data-cadre={section} data-jauge={jauge ? 'oui' : 'non'}>
      <h2>{titre}</h2>
      {children}
    </div>
  ),
}));
vi.mock('@/lib/access/server-guards', () => ({ resolveAgencyOrNull: (...a: unknown[]) => mockAgence(...a) }));
vi.mock('@/lib/queries/agency-upgrade', () => ({ fetchAgencyUpgradeRequests: (...a: unknown[]) => mockListe(...a) }));
vi.mock('@/lib/queries/offre', () => ({
  fetchOffreDePassage: (...a: unknown[]) => mockOffre(...a),
  fetchAbonnement: (...a: unknown[]) => mockAbonnement(...a),
  fetchQuotaDeLAgence: (...a: unknown[]) => mockQuota(...a),
}));
vi.mock('@/components/agency/UpgradeRequestForm', () => ({
  UpgradeRequestForm: (props: Record<string, unknown>) => {
    propsDuFormulaire(props);
    return <form aria-label="formulaire" />;
  },
}));
vi.mock('@/components/agency/UpgradeRequestStatus', () => ({
  UpgradeRequestStatus: ({ request }: { request: AgencyUpgradeRequest }) => <section aria-label={`état ${request.status}`} />,
}));

import Page from '../page';

const demande = (id: number, statut: AgencyUpgradeRequest['status']) =>
  ({ id, status: statut, reviewed_at: '2026-11-02T10:00:00Z' }) as AgencyUpgradeRequest;
const texte = (el: Element | null) => (el?.textContent ?? '').replace(/[  ]/g, ' ');
const HOTE = {
  id: 4,
  kind: 'individual',
  legal_name: 'Studio de Aminata SARL',
  rccm: 'SN-DKR-2024-B-12345',
  ninea: null,
  legal_address: 'Villa 218, Dakar',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAgence.mockResolvedValue(HOTE);
  mockListe.mockResolvedValue({ data: [] });
  mockOffre.mockResolvedValue({ code: 'pro', label: 'Offre Pro', monthly_price_xof: 65000, platform_fee_pct: 3, limits: {} });
});

describe('/app/settings/agency/upgrade — hôte individuel', () => {
  it('AC3 — le prix est celui de l’API, avant le formulaire prérempli des mentions légales', async () => {
    render(withIntl(await Page()));
    // La section « Offre » de la fiche, dans son cadre.
    expect(document.querySelector('[data-cadre="offre"][data-jauge="non"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Passer en agence professionnelle' })).toBeInTheDocument();
    const avantages = screen.getByRole('region', { name: 'Pourquoi passer en pro ?' });
    expect(texte(avantages)).toContain('65 000 F CFA / mois');
    expect(texte(avantages)).toContain('et 3 % sur les paiements encaissés en ligne. Votre abonnement commence à l’approbation.');
    expect(texte(avantages)).not.toMatch(/engagement|premier mois/i);
    expect(propsDuFormulaire).toHaveBeenCalledWith(
      expect.objectContaining({
        agencyId: 4,
        refusee: null,
        prefill: { company_legal_name: 'Studio de Aminata SARL', rc: 'SN-DKR-2024-B-12345', ninea: null, address_fiscale: 'Villa 218, Dakar' },
      }),
    );
  });

  it('sans offre publiée (404 → null), l’écran le dit — aucun montant', async () => {
    mockOffre.mockResolvedValue(null);
    render(withIntl(await Page()));
    // La section « Offre » de la fiche, dans son cadre.
    expect(document.querySelector('[data-cadre="offre"][data-jauge="non"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Passer en agence professionnelle' })).toBeInTheDocument();
    const avantages = screen.getByRole('region', { name: 'Pourquoi passer en pro ?' });
    expect(texte(avantages)).toContain('n’est pas disponible pour le moment');
    expect(texte(avantages)).not.toMatch(/F CFA/);
  });

  it('AC4 — demande refusée : son état est le premier bloc, et le formulaire la reprend', async () => {
    mockListe.mockResolvedValue({ data: [demande(2, 'rejected'), demande(1, 'revoked')] });
    const { container } = render(withIntl(await Page()));
    const etat = screen.getByRole('region', { name: 'état rejected' });
    const formulaire = screen.getByRole('form', { name: 'formulaire' });
    expect(etat.compareDocumentPosition(formulaire) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('section')).toBe(etat);
    expect(propsDuFormulaire).toHaveBeenCalledWith(expect.objectContaining({ refusee: expect.objectContaining({ id: 2 }) }));
  });

  it('une demande révoquée ne se reprend pas : le formulaire repart d’une première demande', async () => {
    mockListe.mockResolvedValue({ data: [demande(3, 'revoked'), demande(2, 'rejected')] });
    render(withIntl(await Page()));
    expect(propsDuFormulaire).toHaveBeenCalledWith(expect.objectContaining({ refusee: null }));
  });

  it('une demande en cours ferme le formulaire', async () => {
    mockListe.mockResolvedValue({ data: [demande(5, 'pending')] });
    render(withIntl(await Page()));
    expect(screen.getByRole('region', { name: 'état pending' })).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('une liste illisible est un état d’erreur, jamais le formulaire vide', async () => {
    mockListe.mockRejectedValue(new Error('503'));
    render(withIntl(await Page()));
    expect(document.querySelector('[data-cadre="offre"][data-jauge="non"]')).not.toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Votre demande n’a pas pu être lue');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});

describe('/app/settings/agency/upgrade — agence déjà professionnelle', () => {
  beforeEach(() => {
    mockAgence.mockResolvedValue({ id: 1, kind: 'standard' });
    mockListe.mockResolvedValue({ data: [demande(7, 'approved')] });
    mockQuota.mockResolvedValue({ biens: { limit: 100, used: 67 }, agents: { limit: 15, used: 9 } });
    mockAbonnement.mockResolvedValue({
      effective_platform_fee_pct: 3,
      effective_limits: { max_branches: 3 },
      plan: { label: 'Offre Pro', monthly_price_xof: 65000 },
    });
  });

  it('« déjà professionnelle », l’offre et ses jauges, ce que le passage a ouvert — sans formulaire', async () => {
    render(withIntl(await Page()));
    // La maquette a-8 pose la jauge sur l'offre d'une agence déjà professionnelle, et là seulement.
    expect(document.querySelector('[data-cadre="offre"][data-jauge="oui"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Offre et passage en pro' })).toBeInTheDocument();
    expect(screen.getByText('Votre agence est déjà professionnelle')).toBeInTheDocument();
    expect(screen.getByText(/Demande approuvée le 2 novembre 2026\./)).toBeInTheDocument();
    const offre = screen.getByRole('region', { name: 'Offre Pro' });
    expect(texte(offre)).toContain('65 000 F CFA / mois');
    expect(screen.getByRole('link', { name: 'Abonnement et factures' })).toHaveAttribute('href', '/app/agency/billing');
    const acquis = screen.getByRole('region', { name: 'Ce que le passage en pro a ouvert' });
    expect(texte(acquis)).toContain('9 agents · inviter, déléguer le suivi des biens');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(mockOffre).not.toHaveBeenCalled();
  });

  it('un abonnement illisible se dit à sa place, la page tient', async () => {
    mockAbonnement.mockRejectedValue(new Error('503'));
    render(withIntl(await Page()));
    expect(screen.getByRole('alert')).toHaveTextContent("Impossible de charger l'abonnement.");
    expect(screen.getByText('Votre agence est déjà professionnelle')).toBeInTheDocument();
  });
});
