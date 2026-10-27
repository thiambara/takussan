import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRadarDashboard, fetchRadarListings } from '@/lib/queries/radar';
import { withIntl } from '@/test/intl';
import type { RadarDashboard, RadarListingRow } from '@/types/radar';
import SuperAdminRadarPage from '../page';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  fetchRadarDashboard: vi.fn(),
  fetchRadarListings: vi.fn(),
  postRadarListings: vi.fn(),
}));

const DASHBOARD: RadarDashboard = {
  stages: {
    captured: 3, extracted: 7, reviewed: 4, contacted: 0, consented: 0, published: 2,
    extraction_failed: 5, duplicate: 0, refused: 0, do_not_contact: 1, purged: 0,
  },
  pending_extraction: 1,
  ai: { spent_today_xof: 20, daily_budget_xof: 2000, global_spent_today_xof: 23, global_daily_budget_xof: 5000 },
};

function ligne(partiel: Partial<RadarListingRow> & Pick<RadarListingRow, 'id'>): RadarListingRow {
  return {
    source_kind: 'url',
    source_site: 'coinafrique',
    source_url: 'https://www.coinafrique.com/annonce/42',
    extracted: null,
    stage: 'captured',
    stage_reason: null,
    created_at: '2026-10-27T10:00:00+00:00',
    ...partiel,
  };
}

const LIGNES: RadarListingRow[] = [
  ligne({
    id: 1,
    stage: 'extracted',
    extracted: {
      title: { value: 'Appartement F3 meublé', confidence: 'high' },
      price: { value: 350000, confidence: 'high', raw: '350 000 F/mois', period: 'monthly' },
      neighborhood: { value: 'Mermoz', confidence: 'high', neighborhood_id: 12, suggestions: [] },
    },
  }),
  ligne({ id: 2, stage: 'extraction_failed', stage_reason: 'radar.fetch.http_error' }),
  ligne({ id: 3, stage: 'captured', stage_reason: 'ai.budget', source_kind: 'text', source_site: 'whatsapp', source_url: null }),
  ligne({ id: 4, stage: 'captured', stage_reason: null }),
  ligne({ id: 5, stage: 'extraction_failed', stage_reason: 'radar.code.inconnu', source_kind: 'captures', source_url: null }),
];

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <SuperAdminRadarPage />
    </QueryClientProvider>,
  ));
}

beforeEach(() => {
  vi.mocked(fetchRadarDashboard).mockReset().mockResolvedValue({ data: DASHBOARD });
  vi.mocked(fetchRadarListings).mockReset().mockResolvedValue({
    data: LIGNES,
    meta: { total: LIGNES.length, per_page: 25, current_page: 1, last_page: 1 },
  });
});

describe('/super-admin/radar (TCK-2386)', () => {
  it('rend les compteurs de travail et le coût IA du jour rapporté au plafond', async () => {
    renderPage();
    const compteurs = await screen.findByTestId('radar-counters');

    const tuile = async (libelle: string) => (await within(compteurs).findByText(libelle)).closest('div')!.parentElement!;
    expect(within(await tuile('À relire')).getByText('7')).toBeInTheDocument();
    expect(within(await tuile('En attente')).getByText('1')).toBeInTheDocument();
    expect(within(await tuile('Échouées')).getByText('5')).toBeInTheDocument();
    expect(within(await tuile('À contacter')).getByText('4')).toBeInTheDocument();
    expect(within(await tuile('Publiées')).getByText('2')).toBeInTheDocument();
    const cout = await tuile('Coût IA du jour');
    expect(cout.textContent).toMatch(/20\s*F\s*CFA/);
    expect(cout.textContent).toMatch(/sur un plafond de 2\s000\s*F\s*CFA/);
  });

  it('rend la liste : étape, site, titre, prix, quartier, date', async () => {
    renderPage();
    const premiere = await screen.findByTestId('radar-listing-1');
    expect(within(premiere).getByText('Appartement F3 meublé')).toBeInTheDocument();
    expect(within(premiere).getByText('CoinAfrique')).toBeInTheDocument();
    expect(premiere.textContent).toMatch(/350\s000\s*F\s*CFA/);
    expect(within(premiere).getByText('/ mois')).toBeInTheDocument();
    expect(within(premiere).getByText('Mermoz')).toBeInTheDocument();
    expect(within(premiere).getAllByText('À relire').length).toBeGreaterThan(0);
  });

  it('lit les motifs : échec d’une URL → texte ou captures, attente, extraction en cours, code inconnu brut', async () => {
    renderPage();

    const echec = await screen.findByTestId('radar-listing-2');
    expect(within(echec).getByText('Le site a répondu par une erreur.')).toBeInTheDocument();
    expect(within(echec).getByText('Essayez le texte ou les captures.')).toBeInTheDocument();

    const attente = screen.getByTestId('radar-listing-3');
    expect(within(attente).getByText('En attente : Le plafond de dépense IA du jour est atteint : l’extraction reprendra.')).toBeInTheDocument();
    expect(within(attente).queryByText('Essayez le texte ou les captures.')).not.toBeInTheDocument();

    expect(within(screen.getByTestId('radar-listing-4')).getByText('Extraction en cours…')).toBeInTheDocument();
    expect(within(screen.getByTestId('radar-listing-5')).getByText('radar.code.inconnu')).toBeInTheDocument();
  });

  it('filtre par étape côté serveur', async () => {
    renderPage();
    await screen.findByTestId('radar-listing-1');
    expect(fetchRadarListings).toHaveBeenLastCalledWith({ stage: undefined, page: 1, perPage: 25 });

    await userEvent.click(screen.getByRole('combobox', { name: 'Filtrer par étape' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Extraction échouée' }));

    await vi.waitFor(() => expect(fetchRadarListings).toHaveBeenLastCalledWith({ stage: 'extraction_failed', page: 1, perPage: 25 }));
  });

  it('ouvre la saisie rapide depuis l’en-tête', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Saisir des annonces' }));
    expect(await screen.findByRole('dialog', { name: 'Saisie rapide' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'URL' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Texte' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Captures' })).toBeInTheDocument();
  });
});
