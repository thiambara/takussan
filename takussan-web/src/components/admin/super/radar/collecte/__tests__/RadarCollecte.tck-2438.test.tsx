import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { fetchRadarCrawlRuns, fetchRadarCrawlSources, patchRadarCrawlSource } from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarCrawlSource } from '@/types/radar';
import { RadarCollecte } from '../RadarCollecte';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRadarCrawlSources: vi.fn(),
  fetchRadarCrawlRuns: vi.fn(),
  patchRadarCrawlSource: vi.fn(),
  startRadarCrawlRun: vi.fn(),
}));

const SUPPORT: PlatformAbilities = { level: 'support', abilities: ['platform.console.access', 'platform.radar.operate'] };

const DEFAUT = 'https://www.expat-dakar.com/immobilier';
const APPARTEMENTS = 'https://www.expat-dakar.com/appartements-a-louer';
const TERRAINS = 'https://www.expat-dakar.com/terrains-a-vendre';

const EXPAT: RadarCrawlSource = {
  id: 1, site: 'expat_dakar', enabled: false, frequency_minutes: 360, max_pages: 5, enabled_at: null, operator: null,
  start_urls: null, default_start_url: DEFAUT, start_hosts: ['www.expat-dakar.com', 'expat-dakar.com'],
};
const COIN: RadarCrawlSource = {
  id: 2, site: 'coinafrique', enabled: false, frequency_minutes: 360, max_pages: 5, enabled_at: null, operator: null,
  start_urls: [APPARTEMENTS.replace('www.expat-dakar.com', 'sn.coinafrique.com')],
  default_start_url: 'https://sn.coinafrique.com/categorie/immobilier', start_hosts: ['sn.coinafrique.com'],
};

function rendre(gestes?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RadarCollecte />, gestes)}</QueryClientProvider>));
  return userEvent.setup();
}

beforeEach(() => {
  vi.mocked(fetchRadarCrawlSources).mockReset().mockResolvedValue({ data: [EXPAT, COIN] });
  vi.mocked(fetchRadarCrawlRuns).mockReset().mockResolvedValue({
    data: [],
    meta: { current_page: 1, last_page: 1, per_page: 20, total: 0, from: null, to: null },
  } as never);
  vi.mocked(patchRadarCrawlSource).mockReset();
});

describe('RadarCollecte — URL de départ (TCK-2438)', () => {
  it('AC7 — le super-administrateur saisit plusieurs URL, une par ligne : la console les envoie sans les lignes vides', async () => {
    vi.mocked(patchRadarCrawlSource).mockResolvedValue({ data: { ...EXPAT, start_urls: [APPARTEMENTS, TERRAINS] } });
    const user = rendre();

    const champ = await screen.findByTestId('radar-collecte-urls-expat_dakar');
    expect(champ).toHaveValue('');
    expect(champ).toHaveAttribute('placeholder', DEFAUT);
    const carte = screen.getByTestId('radar-collecte-source-expat_dakar');
    expect(carte).toHaveTextContent('sur www.expat-dakar.com, expat-dakar.com');
    expect(carte).toHaveTextContent(`Vide : ${DEFAUT}.`);

    await user.type(champ, `  ${APPARTEMENTS}  {enter}{enter}${TERRAINS}`);
    await user.click(within(carte).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(patchRadarCrawlSource).toHaveBeenCalledWith('expat_dakar', {
        frequency_minutes: 360,
        max_pages: 5,
        start_urls: [APPARTEMENTS, TERRAINS],
      }),
    );
    expect(await within(carte).findByText('Réglage enregistré.')).toBeInTheDocument();
  });

  it('AC7 — les URL enregistrées remplissent le champ ; le vider renvoie une liste vide (retour à la configuration)', async () => {
    vi.mocked(patchRadarCrawlSource).mockResolvedValue({ data: { ...COIN, start_urls: null } });
    const user = rendre();

    const champ = await screen.findByTestId('radar-collecte-urls-coinafrique');
    expect(champ).toHaveValue(COIN.start_urls?.[0]);

    await user.clear(champ);
    await user.click(within(screen.getByTestId('radar-collecte-source-coinafrique')).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(patchRadarCrawlSource).toHaveBeenCalledWith('coinafrique', expect.objectContaining({ start_urls: [] })));
  });

  it('AC7 — un refus de l\'API nomme l\'URL par son rang et dit les hôtes permis', async () => {
    vi.mocked(patchRadarCrawlSource).mockRejectedValue(
      new ApiError(422, {
        code: 'radar.crawl.start_url_host',
        params: { field: 'start_urls.1', hosts: ['www.expat-dakar.com', 'expat-dakar.com'] },
      }),
    );
    const user = rendre();

    const champ = await screen.findByTestId('radar-collecte-urls-expat_dakar');
    await user.type(champ, `${APPARTEMENTS}{enter}https://ailleurs.example/liste`);
    const carte = screen.getByTestId('radar-collecte-source-expat_dakar');
    await user.click(within(carte).getByRole('button', { name: 'Enregistrer' }));

    expect(await within(carte).findByRole('alert')).toHaveTextContent(
      'L’URL n° 2 n’est pas sur le site : elle doit partir de www.expat-dakar.com, expat-dakar.com.',
    );
  });

  it('AC5 — le support lit les URL de départ, ou celle de la configuration, sans champ pour les modifier', async () => {
    rendre(SUPPORT);

    const lues = await screen.findByTestId('radar-collecte-urls-lues-coinafrique');
    expect(lues).toHaveTextContent('Pages de départ :');
    expect(lues).toHaveTextContent('https://sn.coinafrique.com/appartements-a-louer');
    expect(screen.getByTestId('radar-collecte-urls-lues-expat_dakar')).toHaveTextContent(`Page de départ : ${DEFAUT} (configuration)`);
    expect(screen.queryByTestId('radar-collecte-urls-expat_dakar')).toBeNull();
  });
});
