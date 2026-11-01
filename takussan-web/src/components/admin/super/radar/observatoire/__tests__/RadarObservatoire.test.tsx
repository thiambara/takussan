import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarNatureHistory, RadarObservatory, RadarRankingRow } from '@/types/radar-observatoire';
import { RadarObservatoire } from '../RadarObservatoire';

/** TCK-2393 (AC7) — l'écran de l'observatoire : deux onglets, colonnes par `fields[]`, filtres envoyés à l'API. */

const VIEWER: PlatformAbilities = {
  level: 'viewer',
  abilities: ['platform.console.access', 'platform.reports.view'],
};

function annonceur(id: number, partiel: Partial<RadarRankingRow> = {}): RadarRankingRow {
  return {
    id,
    display_name: 'Annonceur fictif',
    phone: '+221740000001',
    nature: 'probable_intermediary',
    listings_count: 12,
    published_count: 2,
    outreaches_count: 1,
    neighborhoods_count: 5,
    top_neighborhoods: [{ id: 1, name: 'Almadies', listings: 6 }, { id: 2, name: 'Mermoz', listings: 3 }],
    price_ranges: { rent: { min: 250000, max: 600000 } },
    sites: ['expat_dakar'],
    upgrade_status: null,
    pipeline: 'account',
    ...partiel,
  };
}

const MARCHE: RadarObservatory = {
  summary: { listings: 40, online: 31, gone: 9, in_catalog: 3, sites: ['expat_dakar'] },
  price_per_m2: [{
    neighborhood: { id: 1, name: 'Almadies' }, property_type: 'apartment', contract: 'rent', rent_period: 'monthly',
    listings: 8, median_xof_per_m2: 7000, p25_xof_per_m2: 6000, p75_xof_per_m2: 8000,
  }],
  time_on_market: [{ neighborhood: { id: 1, name: 'Almadies' }, property_type: 'apartment', contract: 'rent', gone: 4, online: 4, median_days: 12.5, mean_days: 14 }],
  supply_gap: [{ neighborhood: { id: 1, name: 'Almadies' }, radar_online: 9, catalog_public: 2, gap: 7 }],
  natures: { probable_owner: 1, probable_intermediary: 3, agency: 0, unknown: 0 },
  gone_sources: [{ listing_id: 5, source_site: 'coinafrique', gone_at: '2026-10-29T10:00:00+00:00', property: { id: 9, title: 'Villa fictive', public: true } }],
};

/** TCK-2431 — trois jours comptés avant la purge : 8 annonceurs-jours intermédiaires, 2 propriétaires. */
let historique: RadarNatureHistory;
const HISTORIQUE: RadarNatureHistory = {
  enabled: true,
  days: 3,
  first_day: '2026-10-01',
  last_day: '2026-10-03',
  advertisers: { probable_owner: 2, probable_intermediary: 8, agency: 0, unknown: 0 },
  listings: { probable_owner: 2, probable_intermediary: 9, agency: 0, unknown: 0 },
};

let classement: RadarRankingRow[];
let fetchMock: ReturnType<typeof vi.fn>;
const urls = () => fetchMock.mock.calls.map(([url]) => new URL(String(url), 'http://localhost'));

function rendre(gestes?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RadarObservatoire />, gestes)}</QueryClientProvider>));
  return userEvent.setup();
}

beforeEach(() => {
  classement = [];
  historique = HISTORIQUE;
  fetchMock = vi.fn(async (url: string) => {
    const u = new URL(String(url), 'http://localhost');
    const corps = u.pathname.endsWith('/observatory/advertisers')
      ? { data: classement, meta: { total: classement.length, per_page: 25, current_page: 1, last_page: 1 } }
      : u.searchParams.get('fields[radar_observatory]') === 'nature_history'
        ? { data: { nature_history: historique }, meta: { confirm_runs: 3 } }
        : { data: MARCHE, meta: { confirm_runs: 3 } };
    return new Response(JSON.stringify(corps), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('L’observatoire du Radar (TCK-2393)', () => {
  it('s’ouvre sur le classement, trié par volume, avec ses colonnes en sparse fieldset ; le marché ne se charge pas', async () => {
    classement = [annonceur(7)];
    rendre();
    const rangee = await screen.findByTestId('radar-classement-7');

    expect(urls()).toHaveLength(1);
    const appel = urls()[0];
    expect(appel.pathname).toBe('/api/super-admin/radar/observatory/advertisers');
    expect(appel.searchParams.get('fields[radar_advertisers]')).toBe('id,display_name,phone,nature');
    expect(appel.searchParams.get('sort')).toBe('-listings_count');
    expect(within(rangee).getByText('Annonceur fictif')).toBeInTheDocument();
    expect(within(rangee).getByText(/Almadies, Mermoz/)).toBeInTheDocument();
    expect(within(rangee).getByText('Compte créé')).toBeInTheDocument();
    // Un compte, une nature d'intermédiaire, aucune demande : la piste vers le passage en agence.
    expect(within(rangee).getByText('À proposer : passage en agence')).toBeInTheDocument();
  });

  it('la recherche part à l’API (filter[search]), jamais sur la liste reçue', async () => {
    const utilisateur = rendre();
    await screen.findByTestId('radar-classement-vide');

    await utilisateur.type(screen.getByRole('searchbox', { name: 'Rechercher un annonceur' }), 'Awa');

    await waitFor(() => expect(urls().some((u) => u.searchParams.get('filter[search]') === 'Awa')).toBe(true));
  });

  it('l’onglet Marché demande ses sections par fields[radar_observatory] et rend les quartiers en manque', async () => {
    const utilisateur = rendre();
    await screen.findByTestId('radar-classement-vide');

    await utilisateur.click(screen.getByRole('tab', { name: 'Marché' }));

    await screen.findByRole('heading', { name: 'Quartiers où Takussan manque d’annonces' });
    const marche = urls().find((u) => u.pathname === '/api/super-admin/radar/observatory' && u.searchParams.get('fields[radar_observatory]') !== 'nature_history')!;
    expect(marche.searchParams.get('fields[radar_observatory]')).toBe('summary,price_per_m2,time_on_market,supply_gap,natures,gone_sources');
    expect(screen.getByText('Villa fictive')).toBeInTheDocument();
    expect(screen.getByText('75 %')).toBeInTheDocument();
    expect(screen.getByText('12,5 jours')).toBeInTheDocument();
  });

  it('dit le nombre réel de passages qui constate une disparition, lu sur l’API (meta.confirm_runs)', async () => {
    const utilisateur = rendre();
    await screen.findByTestId('radar-classement-vide');

    await utilisateur.click(screen.getByRole('tab', { name: 'Marché' }));

    expect(await screen.findByText(/qu’après 3 passages d’affilée qui ont lu toute la liste/)).toBeInTheDocument();
    expect(screen.getByText(/absente de la liste lue par la collecte, 3 passages de suite/)).toBeInTheDocument();
    expect(screen.queryByText(/deux passages/)).not.toBeInTheDocument();
  });

  it('le filtre de date part à l’API (filter[since])', async () => {
    const utilisateur = rendre();
    await screen.findByTestId('radar-classement-vide');
    await utilisateur.click(screen.getByRole('tab', { name: 'Marché' }));
    await screen.findByRole('heading', { name: 'Quartiers où Takussan manque d’annonces' });

    await utilisateur.type(screen.getByLabelText('Vues depuis le'), '2026-10-01');

    await waitFor(() => expect(urls().some((u) => u.searchParams.get('filter[since]') === '2026-10-01')).toBe(true));
  });

  it('la part par nature dans la durée lit les compteurs figés (nature_history), sa période part à l’API', async () => {
    const utilisateur = rendre();
    await screen.findByTestId('radar-classement-vide');
    await utilisateur.click(screen.getByRole('tab', { name: 'Marché' }));

    const intermediaires = await screen.findByTestId('radar-part-nature-probable_intermediary');
    expect(within(intermediaires).getByText('80 %')).toBeInTheDocument();
    expect(within(intermediaires).getByText('8 annonceurs-jours · 9 annonces-jours')).toBeInTheDocument();
    expect(within(screen.getByTestId('radar-part-nature-probable_owner')).getByText('20 %')).toBeInTheDocument();
    expect(screen.getByText(/3 jours comptés, du/)).toBeInTheDocument();
    const historique = () => urls().filter((u) => u.searchParams.get('fields[radar_observatory]') === 'nature_history');
    expect(historique()).toHaveLength(1);
    // Le filtre du marché ne porte pas la borne haute : elle n'appartient qu'à cette section.
    expect(urls().every((u) => !u.searchParams.has('filter[until]'))).toBe(true);

    await utilisateur.type(screen.getByLabelText('Du'), '2026-10-02');
    await utilisateur.type(screen.getByLabelText('Au'), '2026-10-03');

    await waitFor(() => expect(historique().some((u) => u.searchParams.get('filter[since]') === '2026-10-02' && u.searchParams.get('filter[until]') === '2026-10-03')).toBe(true));
  });

  it('dit que le comptage par nature est éteint (défaut), distinct d’une période sans jour compté', async () => {
    historique = { ...HISTORIQUE, enabled: false, days: 0, first_day: null, last_day: null, advertisers: { probable_owner: 0, probable_intermediary: 0, agency: 0, unknown: 0 } };
    const utilisateur = rendre();
    await screen.findByTestId('radar-classement-vide');
    await utilisateur.click(screen.getByRole('tab', { name: 'Marché' }));

    expect(await screen.findByText('Le comptage n’est pas activé')).toBeInTheDocument();
    expect(screen.queryByText('Aucun jour compté sur cette période')).not.toBeInTheDocument();
  });

  it('des jours comptés à zéro annonceur ne se disent pas « aucun jour compté »', async () => {
    historique = { ...HISTORIQUE, advertisers: { probable_owner: 0, probable_intermediary: 0, agency: 0, unknown: 0 } };
    const utilisateur = rendre();
    await screen.findByTestId('radar-classement-vide');
    await utilisateur.click(screen.getByRole('tab', { name: 'Marché' }));

    expect(await screen.findByText('Jours comptés, aucun annonceur')).toBeInTheDocument();
    expect(screen.getByText(/3 jours comptés, du/)).toBeInTheDocument();
    expect(screen.queryByText('Aucun jour compté sur cette période')).not.toBeInTheDocument();
  });

  it('sans le geste du Radar, un refus et aucun appel', () => {
    rendre(VIEWER);
    expect(screen.getByText('Le Radar est réservé aux opérateurs support et super-admin.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
