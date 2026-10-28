import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes } from '@/test/habilitations';
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
    extraction_failed: 5, duplicate: 0, discarded: 0, refused: 0, do_not_contact: 1, purged: 0,
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

/** Les gestes d'un support (`PlatformAbility::forLevel`) : le Radar en fait partie. */
const SUPPORT: PlatformAbilities = {
  level: 'support',
  abilities: ['platform.console.access', 'platform.users.view', 'platform.radar.operate'],
};
const VIEWER: PlatformAbilities = {
  level: 'viewer',
  abilities: ['platform.console.access', 'platform.reports.view', 'platform.health.view', 'platform.agencies.view'],
};

function renderPage(gestes: PlatformAbilities = SUPPORT) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<SuperAdminRadarPage />, gestes)}
    </QueryClientProvider>,
  ));
}

function listeDe(lignes: RadarListingRow[]) {
  return { data: lignes, meta: { total: lignes.length, per_page: 25, current_page: 1, last_page: 1 } };
}

afterEach(() => vi.useRealTimers());

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
    expect(await screen.findByRole('button', { name: /À relire\s*7/ })).toBeInTheDocument();
    expect(within(screen.getByTestId('radar-counter-pending')).getByText('1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Échouées\s*5/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /À contacter\s*4/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Publiées\s*2/ })).toBeInTheDocument();
    const cout = screen.getByTestId('radar-counter-ai');
    expect(cout.textContent).toMatch(/Coût IA du jour/);
    expect(cout.textContent).toMatch(/20\s*F\s*CFA/);
    expect(cout.textContent).toMatch(/sur un plafond de 2\s000\s*F\s*CFA/);
  });

  it('un compteur à filtre exact pose le filtre d’étape', async () => {
    renderPage();
    await screen.findByTestId('radar-listing-1');

    const echouees = screen.getByRole('button', { name: /Échouées\s*5/ });
    expect(echouees).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(echouees);

    await vi.waitFor(() => expect(fetchRadarListings).toHaveBeenLastCalledWith({ stage: 'extraction_failed', page: 1, perPage: 25 }));
    expect(screen.getByRole('button', { name: /Échouées\s*5/ })).toHaveAttribute('aria-pressed', 'true');
    // Le survol se voit : la carte opaque (`bg-card`) le porte, pas le bouton qu'elle recouvre.
    const carte = echouees.firstElementChild as HTMLElement;
    expect(echouees).toHaveClass('group');
    expect(carte).toHaveClass('group-hover:bg-muted/40');
    // « En attente » n'a pas de filtre exact (`captured` mêle attente et extraction en cours) : pas un bouton.
    expect(screen.queryByRole('button', { name: /En attente/ })).not.toBeInTheDocument();
  });

  it('le titre de chaque annonce ouvre sa fiche, titre extrait ou non (TCK-2387)', async () => {
    renderPage();
    const premiere = await screen.findByTestId('radar-listing-1');
    expect(within(premiere).getByRole('link', { name: 'Appartement F3 meublé' })).toHaveAttribute('href', '/super-admin/radar/1');

    const sansTitre = screen.getByTestId('radar-listing-2');
    expect(within(sansTitre).getByRole('link', { name: 'Sans titre extrait' })).toHaveAttribute('href', '/super-admin/radar/2');
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

  it('un site inconnu s’affiche brut', async () => {
    vi.mocked(fetchRadarListings).mockResolvedValue(listeDe([
      ligne({ id: 8, source_site: 'site_futur' as RadarListingRow['source_site'] }),
    ]));
    renderPage();
    expect(within(await screen.findByTestId('radar-listing-8')).getByText('site_futur')).toBeInTheDocument();
  });

  it('un viewer qui tape l’URL lit un seul refus, sans bouton de saisie ni appel', async () => {
    renderPage(VIEWER);
    expect(await screen.findByText('Le Radar est réservé aux opérateurs support et super-admin.')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Saisir des annonces' })).not.toBeInTheDocument();
    expect(fetchRadarDashboard).not.toHaveBeenCalled();
    expect(fetchRadarListings).not.toHaveBeenCalled();
  });
});

describe('/super-admin/radar — relecture tant qu’une extraction tourne (TCK-2386)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });

  it('relit liste et compteurs toutes les 10 s pendant une extraction, puis s’arrête', async () => {
    vi.mocked(fetchRadarDashboard).mockResolvedValue({
      data: { ...DASHBOARD, stages: { ...DASHBOARD.stages, captured: 1 }, pending_extraction: 0 },
    });
    vi.mocked(fetchRadarListings).mockResolvedValue(listeDe([ligne({ id: 4, stage: 'captured', stage_reason: null })]));
    renderPage();
    await screen.findByTestId('radar-listing-4');
    expect(fetchRadarListings).toHaveBeenCalledTimes(1);
    expect(fetchRadarDashboard).toHaveBeenCalledTimes(1);

    // L'extraction aboutit : la relecture suivante la voit, puis plus rien ne repart.
    vi.mocked(fetchRadarDashboard).mockResolvedValue({ data: { ...DASHBOARD, stages: { ...DASHBOARD.stages, captured: 0 }, pending_extraction: 0 } });
    vi.mocked(fetchRadarListings).mockResolvedValue(listeDe([ligne({ id: 4, stage: 'extracted', stage_reason: null })]));
    vi.advanceTimersByTime(10_000);
    await vi.waitFor(() => expect(fetchRadarListings).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(fetchRadarDashboard).toHaveBeenCalledTimes(2));
    await within(screen.getByTestId('radar-listing-4')).findAllByText('À relire');

    vi.advanceTimersByTime(30_000);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchRadarListings).toHaveBeenCalledTimes(2);
    expect(fetchRadarDashboard).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['radar.fetch.deferred'],
    ['ai.response_truncated'],
    ['radar.extraction.invalid_output'],
  ])('relit liste et compteurs pendant une attente courte (%s, revue finale F6)', async (motif) => {
    // Le compteur range l'attente courte dans `pending_extraction` : seule la liste voit le motif.
    vi.mocked(fetchRadarDashboard).mockResolvedValue({
      data: { ...DASHBOARD, stages: { ...DASHBOARD.stages, captured: 1 }, pending_extraction: 1 },
    });
    vi.mocked(fetchRadarListings).mockResolvedValue(listeDe([ligne({ id: 7, stage: 'captured', stage_reason: motif })]));
    renderPage();
    await screen.findByTestId('radar-listing-7');
    expect(fetchRadarListings).toHaveBeenCalledTimes(1);

    vi.mocked(fetchRadarDashboard).mockResolvedValue({ data: { ...DASHBOARD, stages: { ...DASHBOARD.stages, captured: 0 }, pending_extraction: 0 } });
    vi.mocked(fetchRadarListings).mockResolvedValue(listeDe([ligne({ id: 7, stage: 'extracted', stage_reason: null })]));
    vi.advanceTimersByTime(10_000);
    await vi.waitFor(() => expect(fetchRadarListings).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(fetchRadarDashboard).toHaveBeenCalledTimes(2));
    await within(screen.getByTestId('radar-listing-7')).findAllByText('À relire');
    await new Promise((r) => setTimeout(r, 20));

    vi.advanceTimersByTime(30_000);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchRadarListings).toHaveBeenCalledTimes(2);
    expect(fetchRadarDashboard).toHaveBeenCalledTimes(2);
  });

  it('ne relit pas une annonce garée sur le plafond IA ou le coupe-circuit', async () => {
    vi.mocked(fetchRadarDashboard).mockResolvedValue({
      data: { ...DASHBOARD, stages: { ...DASHBOARD.stages, captured: 2 }, pending_extraction: 2 },
    });
    vi.mocked(fetchRadarListings).mockResolvedValue(listeDe([
      ligne({ id: 3, stage: 'captured', stage_reason: 'ai.budget' }),
      ligne({ id: 6, stage: 'captured', stage_reason: 'ai.kill_switch' }),
    ]));
    renderPage();
    await screen.findByTestId('radar-listing-3');

    vi.advanceTimersByTime(30_000);
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchRadarListings).toHaveBeenCalledTimes(1);
    expect(fetchRadarDashboard).toHaveBeenCalledTimes(1);
  });
});
