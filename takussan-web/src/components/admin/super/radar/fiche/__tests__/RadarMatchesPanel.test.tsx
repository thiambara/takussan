import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRadarMatches } from '@/lib/queries/radar';
import { ANNONCE, BIEN_PRIVE, BIEN_PUBLIC, fiche, rendreFiche, reponseMatches } from './support';
import type { RadarMatch } from '@/types/radar';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/queries/radar', async (importOriginal) => (await import('./mocks')).mockRadarQueries(await importOriginal<object>()));
vi.mock('@/lib/queries/referentiel-public', async () => (await import('./mocks')).mockReferentiel());

beforeEach(() => {
  vi.mocked(fetchRadarMatches).mockReset().mockResolvedValue(reponseMatches([]));
});

afterEach(() => vi.useRealTimers());

describe('RadarMatchesPanel (TCK-2387)', () => {
  it('TCK-2423 : le libellé du texte suit sa méthode, une reformulation n’est pas un texte identique', async () => {
    const texte = (id: number, strength: 'medium' | 'low', method?: 'trigram' | 'embeddings'): RadarMatch => ({
      ...ANNONCE,
      id,
      strength,
      signals: [{ signal: 'text', strength, similarity: 0.9, method }],
    });
    vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches([
      texte(61, 'medium', 'embeddings'),
      texte(62, 'low', 'embeddings'),
      texte(63, 'medium', 'trigram'),
      texte(64, 'low', 'trigram'),
      texte(65, 'medium'),
    ]));
    await rendreFiche(fiche());

    expect(within(await screen.findByTestId('radar-match-listing-61')).getByText('même sens')).toBeInTheDocument();
    expect(within(screen.getByTestId('radar-match-listing-62')).getByText('sens voisin')).toBeInTheDocument();
    expect(within(screen.getByTestId('radar-match-listing-63')).getByText('texte presque identique')).toBeInTheDocument();
    expect(within(screen.getByTestId('radar-match-listing-64')).getByText('texte ressemblant')).toBeInTheDocument();
    // Un rapprochement figé avant ce ticket n'a pas de méthode : c'était un trigramme.
    expect(within(screen.getByTestId('radar-match-listing-65')).getByText('texte presque identique')).toBeInTheDocument();
  });

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

  describe('un gros catalogue (revue finale)', () => {
    /** Seize annonces du même annonceur : « même téléphone », force moyenne, la plus forte en tête. */
    const MEME_TELEPHONE: RadarMatch[] = Array.from({ length: 16 }, (_, i) => ({
      kind: 'listing',
      id: 100 + i,
      strength: 'medium',
      signals: [{ signal: 'phone', strength: 'medium' }],
      target: { title: `Annonce ${i}`, price: 300000 + i, stage: 'extracted', source_site: 'coinafrique', thumbnail_url: null },
    }));

    it('les cinq plus fortes s\'affichent, le reste se déplie ; l\'alerte compte TOUTES les fortes', async () => {
      vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches(MEME_TELEPHONE));
      const { user } = await rendreFiche(fiche());

      expect(await screen.findByRole('alert')).toHaveTextContent('Cette annonce ressemble à 16 biens ou annonces déjà connus');
      const cartes = () => screen.getAllByTestId(/^radar-match-listing-/);
      expect(cartes()).toHaveLength(5);
      expect(cartes().map((c) => c.dataset.testid)).toEqual([100, 101, 102, 103, 104].map((id) => `radar-match-listing-${id}`));

      const bascule = screen.getByRole('button', { name: 'Voir les 11 autres' });
      expect(bascule).toHaveAttribute('aria-expanded', 'false');
      await user.click(bascule);

      expect(cartes()).toHaveLength(16);
      const repliee = screen.getByRole('button', { name: 'Voir moins' });
      expect(repliee).toHaveAttribute('aria-expanded', 'true');
      await user.click(repliee);
      expect(cartes()).toHaveLength(5);
    });

    it('cinq rapprochements ou moins : pas de bascule', async () => {
      vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches(MEME_TELEPHONE.slice(0, 5)));
      await rendreFiche(fiche());

      await screen.findByTestId('radar-match-listing-100');
      expect(screen.queryByRole('button', { name: /Voir les .* autres|Voir moins/ })).toBeNull();
    });

    it('le dialogue de doublon propose tous les rapprochements, repliés ou non', async () => {
      vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches(MEME_TELEPHONE));
      const { user } = await rendreFiche(fiche());
      await screen.findByTestId('radar-match-listing-100');
      await user.keyboard('d');

      const dialogue = await screen.findByRole('dialog');
      expect(within(dialogue).getByRole('radio', { name: /Annonce 15 /i })).toBeInTheDocument();
    });
  });

  describe('une annonce cible déjà doublon', () => {
    const DEJA_DOUBLON: RadarMatch = {
      kind: 'listing',
      id: 77,
      strength: 'medium',
      signals: [{ signal: 'phone', strength: 'medium' }],
      target: { title: 'Annonce fermée', price: 300000, stage: 'duplicate', source_site: 'coinafrique', thumbnail_url: null },
    };

    it('« Doublon de celui-ci » est désactivé, avec son indice : l\'API la refuserait', async () => {
      vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches([DEJA_DOUBLON, ANNONCE]));
      await rendreFiche(fiche());

      const fermee = await screen.findByTestId('radar-match-listing-77');
      const bouton = within(fermee).getByRole('button', { name: 'Doublon de celui-ci' });
      expect(bouton).toBeDisabled();
      expect(bouton).toHaveAccessibleDescription(/déjà un doublon : choisissez son annonce d’origine/);
      // Une autre annonce reste un choix.
      expect(within(screen.getByTestId('radar-match-listing-51')).getByRole('button', { name: 'Doublon de celui-ci' })).toBeEnabled();
    });

    it('le dialogue la montre, mais ne la laisse pas choisir', async () => {
      vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches([BIEN_PUBLIC, DEJA_DOUBLON]));
      const { user } = await rendreFiche(fiche());
      await screen.findByTestId('radar-match-listing-77');
      await user.keyboard('d');

      const dialogue = await screen.findByRole('dialog');
      const radio = within(dialogue).getByRole('radio', { name: /Annonce fermée.*déjà un doublon/ });
      expect(radio).toBeDisabled();
      expect(within(dialogue).getByRole('radio', { name: /Villa aux Almadies/ })).toBeEnabled();
    });
  });

  describe('l\'interrogation de la route', () => {
    it.each(['none', 'done'] as const)('un statut `%s` ne fait jamais rappeler la route', async (status) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches([], { status, total: status === 'done' ? 2 : 0, done: status === 'done' ? 2 : 0 }));
      await rendreFiche(fiche());
      expect(fetchRadarMatches).toHaveBeenCalledTimes(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(fetchRadarMatches).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('radar-photos-progress')).toBeNull();
    });
  });
});

