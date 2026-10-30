import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { fetchRadarCrawlRuns, fetchRadarCrawlSources, patchRadarCrawlSource, startRadarCrawlRun } from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarCrawlRun, RadarCrawlSource } from '@/types/radar';
import { RadarCollecte } from '../RadarCollecte';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRadarCrawlSources: vi.fn(),
  fetchRadarCrawlRuns: vi.fn(),
  patchRadarCrawlSource: vi.fn(),
  startRadarCrawlRun: vi.fn(),
}));

const SUPPORT: PlatformAbilities = { level: 'support', abilities: ['platform.console.access', 'platform.radar.operate'] };

const ETEINTE: RadarCrawlSource = {
  id: 1, site: 'expat_dakar', enabled: false, frequency_minutes: 360, max_pages: 5, enabled_at: null, operator: null,
};
const ALLUMEE: RadarCrawlSource = {
  id: 2, site: 'coinafrique', enabled: true, frequency_minutes: 720, max_pages: 3, enabled_at: '2026-10-30T08:00:00Z',
  operator: { id: 9, name: 'Awa Fictive' },
};

const PASSAGE: RadarCrawlRun = {
  id: 41, site: 'coinafrique', trigger: 'schedule', status: 'finished', started_at: '2026-10-30T08:00:00Z',
  finished_at: '2026-10-30T08:03:00Z', pages_read: 3, cards_seen: 60, listings_created: 12, listings_known: 48,
  snapshots_opened: 14, reached_end: false, stop_reason: 'radar.fetch.robots', created_at: '2026-10-30T08:00:00Z',
};

function rendre(gestes?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RadarCollecte />, gestes)}</QueryClientProvider>));
  return userEvent.setup();
}

beforeEach(() => {
  vi.mocked(fetchRadarCrawlSources).mockReset().mockResolvedValue({ data: [ETEINTE, ALLUMEE] });
  vi.mocked(fetchRadarCrawlRuns).mockReset().mockResolvedValue({
    data: [PASSAGE],
    meta: { current_page: 1, last_page: 1, per_page: 20, total: 1, from: 1, to: 1 },
  } as never);
  vi.mocked(patchRadarCrawlSource).mockReset();
  vi.mocked(startRadarCrawlRun).mockReset();
});

describe('RadarCollecte (TCK-2392)', () => {
  it('les sites et leurs passages : état, opérateur, compteurs, et le motif d\'arrêt en libellé', async () => {
    rendre();

    const eteinte = await screen.findByTestId('radar-collecte-source-expat_dakar');
    expect(eteinte).toHaveTextContent('Éteint');
    expect(eteinte).toHaveTextContent('Aucun opérateur');
    const allumee = screen.getByTestId('radar-collecte-source-coinafrique');
    expect(allumee).toHaveTextContent('Allumé');
    expect(allumee).toHaveTextContent('Au nom de Awa Fictive');

    const ligne = await screen.findByTestId('radar-collecte-passage-41');
    expect(ligne).toHaveTextContent('Terminé');
    expect(ligne).toHaveTextContent('Planifié');
    expect(ligne).toHaveTextContent('12');
    // Un refus de lecture se dit par le libellé des motifs du Radar, jamais par son code.
    expect(ligne).not.toHaveTextContent('radar.fetch.robots');
  });

  it('AC4 — le super-administrateur allume un site : la console envoie le geste, rien d\'autre', async () => {
    vi.mocked(patchRadarCrawlSource).mockResolvedValue({ data: { ...ETEINTE, enabled: true } });
    const user = rendre();

    await user.click(await screen.findByTestId('radar-collecte-bascule-expat_dakar'));

    await waitFor(() => expect(patchRadarCrawlSource).toHaveBeenCalledWith('expat_dakar', { enabled: true }));
    expect(startRadarCrawlRun).not.toHaveBeenCalled();
    expect(await screen.findByText('Réglage enregistré.')).toBeInTheDocument();
  });

  it('un passage déjà en cours : le refus 409 se dit par son code', async () => {
    vi.mocked(startRadarCrawlRun).mockRejectedValue(new ApiError(409, { code: 'radar.crawl.active' }));
    const user = rendre();

    await user.click(await screen.findByTestId('radar-collecte-lancer-coinafrique'));

    const carte = screen.getByTestId('radar-collecte-source-coinafrique');
    expect(await within(carte).findByRole('alert')).toHaveTextContent('Un passage est déjà en cours sur ce site');
  });

  it('le support lit, sans aucun bouton de réglage', async () => {
    rendre(SUPPORT);

    await screen.findByTestId('radar-collecte-source-expat_dakar');
    expect(screen.queryByTestId('radar-collecte-bascule-expat_dakar')).toBeNull();
    expect(screen.queryByTestId('radar-collecte-lancer-expat_dakar')).toBeNull();
    expect(screen.getByText(/Seul le super-administrateur allume un site/)).toBeInTheDocument();
  });
});
