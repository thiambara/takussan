import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import {
  fetchRadarTarget,
  fetchRadarTargetListings,
  retireRadarTarget,
  updateRadarTarget,
} from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarTarget, RadarTargetCriteria, RadarTargetListingRow } from '@/types/radar';
import { RadarCibleFiche } from '../RadarCibleFiche';

vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => '/super-admin/radar/targets/12',
}));

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRadarDashboard: vi.fn(async () => ({ data: { follow_ups_due: 0 } })),
  fetchRadarTarget: vi.fn(),
  fetchRadarTargetListings: vi.fn(),
  updateRadarTarget: vi.fn(),
  retireRadarTarget: vi.fn(),
}));

vi.mock('@/lib/queries/referentiel-public', () => ({
  useVillesDuReferentiel: () => ({ data: { data: [] }, isLoading: false }),
  useQuartiersDuReferentiel: () => ({ data: { data: [] }, isLoading: false }),
}));

const SUPPORT: PlatformAbilities = { level: 'support', abilities: ['platform.console.access', 'platform.radar.operate'] };

const SANS_CRITERE: RadarTargetCriteria = {
  cities: [], neighborhoods: [], types: [], contract: null, price_min: null, price_max: null,
  bedrooms_min: null, bedrooms_max: null, furnished: null, sites: [], max_age_days: null,
};

const CIBLE: RadarTarget = {
  id: 12,
  name: 'F3 Almadies',
  origin: 'operator',
  status: 'active',
  pinned: false,
  criteria: { ...SANS_CRITERE, types: ['apartment'], contract: 'rent', bedrooms_min: 2, bedrooms_max: 3 },
  demand_count: null,
  matches_count: 30,
  last_matched_at: '2026-11-04T10:00:00+00:00',
  created_at: '2026-11-03T10:00:00+00:00',
};

const annonce = (id: number, autres: Partial<RadarTargetListingRow> = {}): RadarTargetListingRow => ({
  id,
  source_site: 'expat_dakar',
  source_url: `https://www.expat-dakar.com/annonce/${id}`,
  photo_urls: ['https://img.expat-dakar.com/a.jpg'],
  extracted: {
    title: { value: `Appartement ${id}`, confidence: 'high', evidence: null },
    price: { value: 450000, confidence: 'high', evidence: null },
    rent_period: { value: 'monthly', confidence: 'high', evidence: null },
    neighborhood: { value: 'Almadies', confidence: 'high', evidence: null },
  } as RadarTargetListingRow['extracted'],
  stage: 'extracted',
  created_at: '2026-11-04T09:00:00+00:00',
  ...autres,
});

const pageDAnnonces = (data: RadarTargetListingRow[], currentPage: number, lastPage: number) => ({
  data,
  meta: { current_page: currentPage, last_page: lastPage, per_page: 24, total: 30, from: 1, to: data.length },
}) as never;

function rendre(gestes?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RadarCibleFiche id={12} />, gestes)}</QueryClientProvider>));
  return userEvent.setup();
}

beforeEach(() => {
  vi.mocked(fetchRadarTarget).mockReset().mockResolvedValue({ data: CIBLE });
  vi.mocked(fetchRadarTargetListings).mockReset().mockImplementation(async (_id, page = 1) =>
    page === 1 ? pageDAnnonces([annonce(101), annonce(102, { photo_urls: [], extracted: null, stage: 'reviewed' })], 1, 2)
      : pageDAnnonces([annonce(201)], 2, 2));
  vi.mocked(updateRadarTarget).mockReset();
  vi.mocked(retireRadarTarget).mockReset();
});

describe('La page d\'une cible (TCK-2469)', () => {
  it('en-tête : nom, état, résumé des critères et ce qu\'elle a rapporté', async () => {
    rendre();

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('F3 Almadies');
    expect(screen.getByTestId('radar-cible-statut')).toHaveTextContent('Active');
    expect(screen.getByTestId('radar-cible-resume')).toHaveTextContent('Appartement · location · 2-3 ch.');
    expect(screen.getByTestId('radar-cible-trouvees')).toHaveTextContent('30');
  });

  it('AC2 — ses annonces, paginées, chacune menant à la fiche annonce existante', async () => {
    const user = rendre();

    const premiere = await screen.findByTestId('radar-cible-annonce-101');
    expect(premiere).toHaveAttribute('href', '/super-admin/radar/101');
    expect(premiere).toHaveTextContent('Appartement 101');
    expect(premiere).toHaveTextContent(/450\s000\sF\sCFA/u);
    expect(premiere).toHaveTextContent('Almadies');
    expect(premiere).toHaveTextContent('Expat-Dakar');
    expect(premiere).toHaveTextContent('À relire');
    // Une annonce sans lecture ni photo garde sa carte, sans rien inventer.
    const seconde = screen.getByTestId('radar-cible-annonce-102');
    expect(seconde).toHaveTextContent('Sans titre');
    expect(seconde).toHaveTextContent('Prix non lu');
    expect(seconde.querySelector('img')).toBeNull();
    expect(fetchRadarTargetListings).toHaveBeenCalledWith(12, 1, 24);

    await user.click(screen.getByRole('button', { name: 'Suivant' }));

    expect(await screen.findByTestId('radar-cible-annonce-201')).toHaveAttribute('href', '/super-admin/radar/201');
    expect(fetchRadarTargetListings).toHaveBeenLastCalledWith(12, 2, 24);
  });

  it('le super-administrateur règle, met en pause et retire — après confirmation', async () => {
    vi.mocked(updateRadarTarget).mockResolvedValue({ data: { ...CIBLE, status: 'paused' } });
    vi.mocked(retireRadarTarget).mockResolvedValue({ data: { ...CIBLE, status: 'retired' } });
    const user = rendre();

    await user.click(await screen.findByTestId('radar-cible-pause'));
    await waitFor(() => expect(updateRadarTarget).toHaveBeenCalledWith(12, { status: 'paused' }));
    expect(await screen.findByTestId('radar-cible-reprendre')).toBeInTheDocument();
    expect(screen.getByTestId('radar-cible-statut')).toHaveTextContent('En pause');

    await user.click(screen.getByTestId('radar-cible-retirer'));
    expect(retireRadarTarget).not.toHaveBeenCalled();
    await user.click(await screen.findByTestId('radar-cible-retirer-confirmer'));

    await waitFor(() => expect(retireRadarTarget).toHaveBeenCalledWith(12));
    // Retirée : plus aucun geste, la page le dit.
    expect(await screen.findByTestId('radar-cible-retiree')).toBeInTheDocument();
    expect(screen.queryByTestId('radar-cible-gestes')).toBeNull();
  });

  it('AC3 — le support voit tout, sans aucun bouton d\'écriture', async () => {
    rendre(SUPPORT);

    await screen.findByTestId('radar-cible-annonce-101');
    expect(screen.getByTestId('radar-cible-resume')).toBeInTheDocument();
    expect(screen.queryByTestId('radar-cible-gestes')).toBeNull();
    for (const nom of ['Régler', 'Mettre en pause', 'Reprendre', 'Épingler', 'Retirer']) {
      expect(screen.queryByRole('button', { name: nom })).toBeNull();
    }
  });

  it('une cible retirée ne se modifie pas, même par le super-administrateur', async () => {
    vi.mocked(fetchRadarTarget).mockResolvedValue({ data: { ...CIBLE, status: 'retired' } });
    rendre();

    expect(await screen.findByTestId('radar-cible-retiree')).toBeInTheDocument();
    expect(screen.queryByTestId('radar-cible-gestes')).toBeNull();
  });

  it('une cible de la demande : le panneau dit, avant, que modifier ses critères l\'épinglera', async () => {
    vi.mocked(fetchRadarTarget).mockResolvedValue({ data: { ...CIBLE, origin: 'demand', demand_count: 7 } });
    const user = rendre();

    await user.click(await screen.findByTestId('radar-cible-regler'));
    const panneau = await screen.findByTestId('radar-cible-panneau');
    // Rien n'a encore changé : rien à dire.
    expect(within(panneau).queryByTestId('radar-cible-epinglera')).toBeNull();

    await user.click(within(panneau).getByRole('button', { name: 'Villa' }));
    expect(within(panneau).getByTestId('radar-cible-epinglera')).toHaveTextContent('En modifier les critères l’épinglera');
  });

  // TCK-2470 — ce que l'IA peut faire d'une cible de la demande, et le chemin vers ses révisions.
  it.each([
    [{ pinned: false, status: 'active' as const }, 'l’IA peut la régler, la fusionner ou la retirer'],
    [{ pinned: true, status: 'active' as const }, 'elle n’est plus touchée par l’IA'],
    [{ pinned: false, status: 'paused' as const }, 'elle n’est plus touchée par l’IA'],
  ])('une cible de la demande dit ce que l\'IA peut en faire (%o)', async (etat, texte) => {
    vi.mocked(fetchRadarTarget).mockResolvedValue({ data: { ...CIBLE, origin: 'demand', demand_count: 7, ...etat } });
    rendre(SUPPORT);

    const note = await screen.findByTestId('radar-cible-demande');
    expect(note).toHaveTextContent(texte);
    expect(within(note).getByRole('link', { name: 'Voir les révisions de la demande' }))
      .toHaveAttribute('href', '/super-admin/radar/targets/revisions');
  });

  it('une cible de l\'opérateur ne parle pas de la demande', async () => {
    rendre();

    await screen.findByTestId('radar-cible-statut');
    expect(screen.queryByTestId('radar-cible-demande')).toBeNull();
  });

  it('une cible introuvable le dit, sans code brut', async () => {
    vi.mocked(fetchRadarTarget).mockRejectedValue(new ApiError(404, { code: 'not_found' }));
    rendre();

    expect(await screen.findByText('Cette cible n’existe pas.')).toBeInTheDocument();
    expect(screen.queryByText(/not_found/)).toBeNull();
  });
});
