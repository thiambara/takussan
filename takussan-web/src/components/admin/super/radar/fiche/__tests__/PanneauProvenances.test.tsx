import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { fetchRadarMatches, unmergeRadarListing } from '@/lib/queries/radar';
import type { RadarProvenance } from '@/types/radar';
import { fiche, rendreFiche, reponseMatches } from './support';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/queries/radar', async (importOriginal) => (await import('./mocks')).mockRadarQueries(await importOriginal<object>()));
vi.mock('@/lib/queries/referentiel-public', async () => (await import('./mocks')).mockReferentiel());

const RACINE: RadarProvenance = {
  listing_id: 1,
  is_root: true,
  source_kind: 'url',
  source_site: 'expat_dakar',
  source_url: 'https://annonces.test/expat/1',
  stage: 'extracted',
  merged_at: null,
  crawled: false,
  first_seen_at: null,
  last_seen_at: null,
  last_price: null,
};

const FUSIONNEE: RadarProvenance = {
  listing_id: 2,
  is_root: false,
  source_kind: 'url',
  source_site: 'coinafrique',
  source_url: 'https://annonces.test/coinafrique/2',
  stage: 'duplicate',
  merged_at: '2026-10-30T10:00:00Z',
  crawled: true,
  first_seen_at: '2026-10-28T08:00:00Z',
  last_seen_at: '2026-10-30T08:00:00Z',
  last_price: 450000,
};

/** Un doublon posé à la main : aucune fusion automatique, rien à séparer d'ici. */
const A_LA_MAIN: RadarProvenance = { ...FUSIONNEE, listing_id: 3, merged_at: null, crawled: false, first_seen_at: null, last_seen_at: null, last_price: null };

beforeEach(() => {
  vi.mocked(fetchRadarMatches).mockReset().mockResolvedValue(reponseMatches([]));
  vi.mocked(unmergeRadarListing).mockReset();
});

describe('PanneauProvenances (TCK-2392)', () => {
  it('AC3 — la fiche montre ses provenances : site, rôle, fusion automatique, présence et dernier prix', async () => {
    await rendreFiche(fiche({ id: 1, provenances: [RACINE, FUSIONNEE, A_LA_MAIN] }));

    const panneau = await screen.findByTestId('radar-provenances');
    const racine = within(panneau).getByTestId('radar-provenance-1');
    expect(racine).toHaveTextContent('Expat-Dakar');
    expect(racine).toHaveTextContent('Fiche');
    expect(racine).toHaveTextContent('Cette annonce');
    expect(within(racine).queryByRole('button', { name: 'Séparer' })).toBeNull();

    const doublon = within(panneau).getByTestId('radar-provenance-2');
    expect(doublon).toHaveTextContent('CoinAfrique');
    expect(doublon).toHaveTextContent('Doublon');
    expect(doublon).toHaveTextContent('Fusion automatique');
    expect(doublon).toHaveTextContent('Trouvée par la collecte');
    expect(doublon.textContent).toMatch(/450\s000\s*F\s*CFA/);
    expect(within(doublon).getByRole('link', { name: 'Ouvrir l’annonce #2' })).toHaveAttribute('href', '/super-admin/radar/2');
    const source = within(doublon).getByRole('link', { name: /Voir la source/ });
    expect(source).toHaveAttribute('href', 'https://annonces.test/coinafrique/2');
    expect(source).toHaveAttribute('rel', expect.stringContaining('noopener'));

    const aLaMain = within(panneau).getByTestId('radar-provenance-3');
    expect(aLaMain).toHaveTextContent('Doublon');
    expect(aLaMain).not.toHaveTextContent('Fusion automatique');
    expect(within(aLaMain).queryByRole('button', { name: 'Séparer' })).toBeNull();
  });

  it('AC7 — « Séparer » sépare la fusion automatique ; un refus se dit par son code', async () => {
    vi.mocked(unmergeRadarListing).mockRejectedValueOnce(new ApiError(409, { code: 'radar.merge.not_automatic' }));
    const { user } = await rendreFiche(fiche({ id: 1, provenances: [RACINE, FUSIONNEE] }));

    await user.click(await screen.findByTestId('radar-separer-2'));
    expect(await screen.findByText(/seule une fusion automatique se sépare ici/)).toBeInTheDocument();
    expect(unmergeRadarListing).toHaveBeenCalledWith(2);

    vi.mocked(unmergeRadarListing).mockResolvedValueOnce({ data: fiche({ id: 2 }) });
    await user.click(screen.getByTestId('radar-separer-2'));
    await waitFor(() => expect(unmergeRadarListing).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/seule une fusion automatique se sépare ici/)).toBeNull());
  });

  it('une saisie isolée, que la collecte n\'a pas vue, n\'affiche aucun panneau', async () => {
    await rendreFiche(fiche({ id: 1, provenances: [RACINE] }));

    expect(screen.queryByTestId('radar-provenances')).toBeNull();
  });
});
