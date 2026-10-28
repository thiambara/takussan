import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRadarMatches } from '@/lib/queries/radar';
import { ANNONCE, BIEN_PRIVE, BIEN_PUBLIC, fiche, rendreFiche, reponseMatches } from './support';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/queries/radar', async (importOriginal) => (await import('./mocks')).mockRadarQueries(await importOriginal<object>()));
vi.mock('@/lib/queries/referentiel-public', async () => (await import('./mocks')).mockReferentiel());

beforeEach(() => {
  vi.mocked(fetchRadarMatches).mockReset().mockResolvedValue(reponseMatches([]));
});

afterEach(() => vi.useRealTimers());

describe('RadarMatchesPanel (TCK-2387)', () => {
  it('un rapprochement fort ouvre la fiche par une alerte, avec vignette, signaux en libellés et lien public', async () => {
    vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches([BIEN_PUBLIC]));
    await rendreFiche(fiche());

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Cette annonce ressemble à 1 bien ou annonce déjà connu');

    const carte = screen.getByTestId('radar-match-property-7');
    expect(within(carte).getByRole('img')).toHaveAttribute('src', 'https://cdn.test/bien-7.jpg');
    expect(within(carte).getByRole('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(within(carte).getByText('même téléphone')).toBeInTheDocument();
    expect(within(carte).getByText('photo identique')).toBeInTheDocument();
    expect(within(carte).getByText('Villa aux Almadies')).toBeInTheDocument();
    expect(carte.textContent).toMatch(/450\s000\s*F\s*CFA/);
    expect(within(carte).getByText(/Ressemblance Forte/)).toBeInTheDocument();
    const lien = within(carte).getByRole('link', { name: /fiche publique/ });
    expect(lien.getAttribute('href')).toMatch(/\/properties\/villa-aux-almadies$/);
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAttribute('rel', expect.stringContaining('noopener'));

    // L'alerte est AVANT les champs : elle précède le formulaire dans l'ordre du document.
    const formulaire = screen.getByTestId('radar-fiche-form');
    expect(alerte.compareDocumentPosition(formulaire) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('un bien non public mène à la recherche de la console, son statut affiché', async () => {
    vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches([BIEN_PRIVE]));
    await rendreFiche(fiche());

    const carte = await screen.findByTestId('radar-match-property-8');
    const lien = within(carte).getByRole('link', { name: /Chercher dans la console/ });
    expect(lien).toHaveAttribute('href', '/super-admin/properties?filter[search]=TKS-0008');
    expect(carte).toHaveTextContent('Brouillon');
    expect(carte).toHaveTextContent('Non public');
    // Un rapprochement `medium` alerte aussi.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(within(carte).getByText('même quartier, prix et chambres')).toBeInTheDocument();
  });

  it('une annonce mène à sa fiche ; seule une force faible n\'alerte pas', async () => {
    vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches([ANNONCE]));
    await rendreFiche(fiche());

    const carte = await screen.findByTestId('radar-match-listing-51');
    expect(within(carte).getByRole('link', { name: /Ouvrir la fiche Radar/ })).toHaveAttribute('href', '/super-admin/radar/51');
    expect(carte).toHaveTextContent('Annonce du Radar');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('aucun rapprochement : une ligne discrète, ni alerte ni écran vide', async () => {
    await rendreFiche(fiche());

    expect(await screen.findByText('Aucun rapprochement avec un bien ou une annonce connus.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('radar-photos-progress')).toBeNull();
  });

  it('pendant le calcul des empreintes, le compteur se rafraîchit toutes les 10 s, puis s\'arrête', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(fetchRadarMatches)
      .mockResolvedValueOnce(reponseMatches([], { status: 'pending', total: 6, done: 2 }))
      .mockResolvedValueOnce(reponseMatches([BIEN_PUBLIC], { status: 'done', total: 6, done: 6 }))
      .mockResolvedValue(reponseMatches([BIEN_PUBLIC], { status: 'done', total: 6, done: 6 }));
    await rendreFiche(fiche());

    expect(await screen.findByTestId('radar-photos-progress')).toHaveTextContent('Empreintes des photos : 2 / 6');
    expect(fetchRadarMatches).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    await waitFor(() => expect(fetchRadarMatches).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('radar-photos-progress')).toBeNull());
    // Le signal photo est arrivé : le rapprochement s'affiche.
    expect(await screen.findByTestId('radar-match-property-7')).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchRadarMatches).toHaveBeenCalledTimes(2);
  });

  it('« Doublon de celui-ci » ouvre le dialogue de doublon prérempli avec ce rapprochement', async () => {
    vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches([BIEN_PUBLIC, ANNONCE]));
    const { user } = await rendreFiche(fiche());

    const carte = await screen.findByTestId('radar-match-listing-51');
    await user.click(within(carte).getByRole('button', { name: 'Doublon de celui-ci' }));

    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByRole('radio', { name: /F3 Almadies \(autre site\)/ })).toBeChecked();
    expect(within(dialogue).getByRole('radio', { name: /Villa aux Almadies/ })).not.toBeChecked();
    expect(within(dialogue).getByRole('button', { name: 'Marquer comme doublon' })).toBeEnabled();
  });
});
