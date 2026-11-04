import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { fetchRadarCrawlRuns, fetchRadarCrawlSources, patchRadarCrawlSource } from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarCrawlRun, RadarCrawlSource } from '@/types/radar';
import { RadarCollecte } from '../RadarCollecte';

/** TCK-2467 — la découverte d'une source (`discovery` : listes ou sitemap) se règle sur la collecte, et ses codes se lisent. */

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRadarCrawlSources: vi.fn(),
  fetchRadarCrawlRuns: vi.fn(),
  patchRadarCrawlSource: vi.fn(),
  startRadarCrawlRun: vi.fn(),
}));

const SUPPORT: PlatformAbilities = { level: 'support', abilities: ['platform.console.access', 'platform.radar.operate'] };

const EXPAT: RadarCrawlSource = {
  id: 1, site: 'expat_dakar', enabled: true, frequency_minutes: 720, max_pages: 3, enabled_at: '2026-10-30T08:00:00Z',
  operator: { id: 9, name: 'Awa Fictive' }, start_urls: null, default_start_url: 'https://www.expat-dakar.com/immobilier',
  start_hosts: ['www.expat-dakar.com'], scope: 'targeted', discovery: 'sitemap', sitemap_available: true,
};

const COINAFRIQUE: RadarCrawlSource = {
  ...EXPAT, id: 2, site: 'coinafrique', default_start_url: 'https://sn.coinafrique.com/categorie/immobilier',
  start_hosts: ['sn.coinafrique.com'], discovery: 'lists', sitemap_available: false,
};

const PASSAGE: RadarCrawlRun = {
  id: 61, site: 'expat_dakar', trigger: 'schedule', status: 'finished', started_at: '2026-11-04T08:00:00Z',
  finished_at: '2026-11-04T08:00:09Z', pages_read: 1, cards_seen: 0, listings_created: 0, listings_known: 0,
  snapshots_opened: 0, cards_skipped: 0, reached_end: false, stop_reason: 'radar.crawl.sitemap_invalid', created_at: '2026-11-04T08:00:00Z',
};

function rendre(gestes?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RadarCollecte />, gestes)}</QueryClientProvider>));
  return userEvent.setup();
}

beforeEach(() => {
  vi.mocked(fetchRadarCrawlSources).mockReset().mockResolvedValue({ data: [EXPAT, COINAFRIQUE] });
  vi.mocked(fetchRadarCrawlRuns).mockReset().mockResolvedValue({
    data: [PASSAGE],
    meta: { current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 },
  } as never);
  vi.mocked(patchRadarCrawlSource).mockReset();
});

describe('La découverte d\'une source (TCK-2467)', () => {
  it('sitemap : la conséquence se lit, et passer aux listes n\'envoie que `discovery`', async () => {
    vi.mocked(patchRadarCrawlSource).mockResolvedValue({ data: { ...EXPAT, discovery: 'lists' } });
    const user = rendre();

    const decouverte = await screen.findByTestId('radar-collecte-decouverte-expat_dakar');
    expect(within(decouverte).getByTestId('radar-collecte-decouverte-expat_dakar-sitemap')).toHaveAttribute('aria-pressed', 'true');
    expect(decouverte).toHaveTextContent('tout l’inventaire du site est connu en quelques requêtes ; au plus 200 annonces neuves saisies par passage, les autres au passage suivant.');

    await user.click(within(decouverte).getByTestId('radar-collecte-decouverte-expat_dakar-lists'));
    await waitFor(() => expect(patchRadarCrawlSource).toHaveBeenCalledWith('expat_dakar', { discovery: 'lists' }));
  });

  it('un site sans sitemap : « sitemap » est désactivé, et l\'écran dit pourquoi', async () => {
    rendre();

    const decouverte = await screen.findByTestId('radar-collecte-decouverte-coinafrique');
    expect(within(decouverte).getByTestId('radar-collecte-decouverte-coinafrique-sitemap')).toBeDisabled();
    expect(within(decouverte).getByTestId('radar-collecte-decouverte-coinafrique-lists')).toHaveAttribute('aria-pressed', 'true');
    expect(decouverte).toHaveTextContent('Ce site ne propose pas de sitemap');
  });

  it('le refus `radar.crawl.discovery_unavailable` se lit par son libellé', async () => {
    vi.mocked(fetchRadarCrawlSources).mockResolvedValue({ data: [{ ...EXPAT, discovery: 'lists' }] });
    vi.mocked(patchRadarCrawlSource).mockRejectedValue(
      new ApiError(422, { message: 'x', code: 'radar.crawl.discovery_unavailable', params: { field: 'discovery' } }),
    );
    const user = rendre();

    const decouverte = await screen.findByTestId('radar-collecte-decouverte-expat_dakar');
    await user.click(within(decouverte).getByTestId('radar-collecte-decouverte-expat_dakar-sitemap'));
    const carte = screen.getByTestId('radar-collecte-source-expat_dakar');
    expect(await within(carte).findByText('Ce site ne propose pas de lecture par sitemap.')).toBeInTheDocument();
    expect(carte).not.toHaveTextContent('radar.crawl');
  });

  it('le support lit la découverte et sa conséquence, sans pouvoir la changer', async () => {
    rendre(SUPPORT);

    const decouverte = await screen.findByTestId('radar-collecte-decouverte-expat_dakar');
    expect(decouverte).toHaveTextContent('Découverte : Sitemap');
    expect(within(decouverte).queryByRole('button')).toBeNull();
  });

  it('une source d\'avant TCK-2467, sans `discovery`, ne montre aucun réglage', async () => {
    const { discovery: _d, sitemap_available: _s, ...ancienne } = EXPAT;
    vi.mocked(fetchRadarCrawlSources).mockResolvedValue({ data: [ancienne] });
    rendre();

    await screen.findByTestId('radar-collecte-source-expat_dakar');
    expect(screen.queryByTestId('radar-collecte-decouverte-expat_dakar')).toBeNull();
  });

  it('un passage coupé sur un sitemap illisible le dit en libellé', async () => {
    rendre();

    const ligne = await screen.findByTestId('radar-collecte-passage-61');
    expect(ligne).toHaveTextContent('Le sitemap du site est illisible ou vide : lecture coupée');
    expect(ligne).not.toHaveTextContent('radar.crawl.sitemap_invalid');
  });
});
