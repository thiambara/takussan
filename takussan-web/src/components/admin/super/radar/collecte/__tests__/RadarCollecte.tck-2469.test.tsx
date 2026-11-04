import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { fetchRadarCrawlRuns, fetchRadarCrawlSources, patchRadarCrawlSource } from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarCrawlRun, RadarCrawlSource } from '@/types/radar';
import { RadarCollecte } from '../RadarCollecte';

/** TCK-2469 — la portée d'une source (`scope`, TCK-2468) se règle sur la collecte, et sa conséquence se lit. */

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRadarCrawlSources: vi.fn(),
  fetchRadarCrawlRuns: vi.fn(),
  patchRadarCrawlSource: vi.fn(),
  startRadarCrawlRun: vi.fn(),
}));

const SUPPORT: PlatformAbilities = { level: 'support', abilities: ['platform.console.access', 'platform.radar.operate'] };

const SOURCE: RadarCrawlSource = {
  id: 2, site: 'coinafrique', enabled: true, frequency_minutes: 720, max_pages: 3, enabled_at: '2026-10-30T08:00:00Z',
  operator: { id: 9, name: 'Awa Fictive' }, start_urls: null, default_start_url: 'https://sn.coinafrique.com/categorie/immobilier',
  start_hosts: ['sn.coinafrique.com'], scope: 'targeted',
};

const PASSAGE: RadarCrawlRun = {
  id: 51, site: 'coinafrique', trigger: 'schedule', status: 'finished', started_at: '2026-11-04T08:00:00Z',
  finished_at: '2026-11-04T08:00:01Z', pages_read: 0, cards_seen: 0, listings_created: 0, listings_known: 0,
  snapshots_opened: 0, cards_skipped: 17, reached_end: false, stop_reason: 'radar.crawl.no_target', created_at: '2026-11-04T08:00:00Z',
};

function rendre(gestes?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RadarCollecte />, gestes)}</QueryClientProvider>));
  return userEvent.setup();
}

beforeEach(() => {
  vi.mocked(fetchRadarCrawlSources).mockReset().mockResolvedValue({ data: [SOURCE] });
  vi.mocked(fetchRadarCrawlRuns).mockReset().mockResolvedValue({
    data: [PASSAGE],
    meta: { current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 },
  } as never);
  vi.mocked(patchRadarCrawlSource).mockReset();
});

describe('La portée d\'une source (TCK-2469)', () => {
  it('le super-administrateur passe une source de « ciblée » à « tout » : le seul `scope` part', async () => {
    vi.mocked(patchRadarCrawlSource).mockResolvedValue({ data: { ...SOURCE, scope: 'all' } });
    const user = rendre();

    const portee = await screen.findByTestId('radar-collecte-portee-coinafrique');
    expect(within(portee).getByTestId('radar-collecte-portee-coinafrique-targeted')).toHaveAttribute('aria-pressed', 'true');
    expect(portee).toHaveTextContent('seules les annonces qui peuvent correspondre à une cible active sont lues');

    await user.click(within(portee).getByTestId('radar-collecte-portee-coinafrique-all'));

    await waitFor(() => expect(patchRadarCrawlSource).toHaveBeenCalledWith('coinafrique', { scope: 'all' }));
  });

  it('le support lit la portée et sa conséquence, sans pouvoir la changer', async () => {
    rendre(SUPPORT);

    const portee = await screen.findByTestId('radar-collecte-portee-coinafrique');
    expect(portee).toHaveTextContent('Portée : Ciblée');
    expect(within(portee).queryByRole('button')).toBeNull();
  });

  it('un passage arrêté faute de cible le dit en libellé, et compte les cartes laissées', async () => {
    rendre();

    const ligne = await screen.findByTestId('radar-collecte-passage-51');
    expect(ligne).toHaveTextContent('Source ciblée sans cible active : rien n’a été lu');
    expect(ligne).not.toHaveTextContent('radar.crawl.no_target');
    expect(ligne).toHaveTextContent('17');
  });
});
