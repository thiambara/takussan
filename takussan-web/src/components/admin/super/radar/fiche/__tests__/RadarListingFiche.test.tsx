import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { fetchRadarListing, fetchRadarMatches, patchRadarListing } from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarExtracted, RadarListingDetail } from '@/types/radar';
import { RadarListingFiche } from '../RadarListingFiche';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  fetchRadarListing: vi.fn(),
  fetchRadarMatches: vi.fn(),
  patchRadarListing: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/lib/queries/referentiel-public', () => ({
  useVillesDuReferentiel: () => ({ data: { data: [{ id: 1, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: null, longitude: null }] }, isLoading: false }),
  useQuartiersDuReferentiel: (villeId: number | null) => ({
    data: villeId === null ? undefined : {
      data: [
        { id: 12, city_id: 1, name: 'Almadies', slug: 'almadies', latitude: null, longitude: null, status: 'approved' },
        { id: 13, city_id: 1, name: 'Mermoz', slug: 'mermoz', latitude: null, longitude: null, status: 'approved' },
        { id: 14, city_id: 1, name: 'Quartier proposé', slug: 'propose', latitude: null, longitude: null, status: 'pending' },
      ],
    },
    isLoading: false,
  }),
}));

const TEXTE = 'Appartement F3 à louer aux Almadies.\nLoyer : 350 000 FCFA par mois.\nContact via WhatsApp.';

const EXTRACTED: RadarExtracted = {
  title: { value: 'Appartement F3', confidence: 'high', evidence: 'Appartement F3 à louer', flags: [] },
  property_type: { value: 'apartment', confidence: 'high', evidence: 'Appartement', flags: [] },
  contract: { value: 'rent', confidence: 'high', evidence: 'à louer', flags: [] },
  price: { value: 350000, confidence: 'high', evidence: 'Loyer : 350 000 FCFA', flags: [], raw: '350 000 FCFA', period: 'monthly' },
  rent_period: { value: 'monthly', confidence: 'medium', evidence: 'par mois', flags: [] },
  bedrooms: { value: 3, confidence: 'low', evidence: 'trois chambres', flags: ['evidence_not_in_source'] },
  neighborhood: {
    value: 'Almadies',
    confidence: 'high',
    evidence: 'aux Almadies',
    flags: [],
    neighborhood_id: null,
    suggestions: [{ id: 12, name: 'Almadies', city: 'Dakar' }],
  },
  advertiser_nature: { value: 'unknown', confidence: 'low', evidence: null, flags: [] },
  nature_signals: [{ signal: 'Contact par WhatsApp', evidence: 'Contact via WhatsApp' }],
  phones: [],
};

function fiche(partiel: Partial<RadarListingDetail> = {}): RadarListingDetail {
  return {
    id: 42,
    source_kind: 'text',
    source_site: 'whatsapp',
    source_url: null,
    extracted: EXTRACTED,
    stage: 'extracted',
    stage_reason: null,
    created_at: '2026-10-27T10:00:00+00:00',
    updated_at: '2026-10-27T10:05:00+00:00',
    radar_advertiser_id: null,
    raw_text: TEXTE,
    photo_urls: [],
    extracted_at: '2026-10-27T10:01:00+00:00',
    property_id: null,
    duplicate_of_listing_id: null,
    duplicate_of_property_id: null,
    photo_fingerprints: { status: 'none', total: 0, done: 0 },
    neighborhood_link: null,
    advertiser: null,
    ...partiel,
  };
}

async function rendre(detail: RadarListingDetail = fiche()) {
  vi.mocked(fetchRadarListing).mockResolvedValue({ data: detail });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<RadarListingFiche id={detail.id} />)}
    </QueryClientProvider>,
  ));
  await screen.findByTestId('radar-fiche');
  return { queryClient };
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.mocked(fetchRadarListing).mockReset();
  vi.mocked(patchRadarListing).mockReset();
  vi.mocked(fetchRadarMatches).mockReset().mockResolvedValue({ data: { photos: { status: 'none', total: 0, done: 0 }, matches: [] } });
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  // @ts-expect-error — jsdom n'a pas `scrollIntoView` : on le retire comme on l'a posé.
  delete Element.prototype.scrollIntoView;
});

describe('RadarListingFiche — la source (TCK-2387)', () => {
  it('rend le texte source, préformaté, et le lien vers l\'annonce d\'origine', async () => {
    await rendre(fiche({ source_kind: 'url', source_site: 'coinafrique', source_url: 'https://www.coinafrique.com/annonce/42' }));

    const source = screen.getByTestId('radar-source-text');
    expect(source).toHaveTextContent('Appartement F3 à louer aux Almadies.');
    expect(source.textContent).toBe(TEXTE);
    expect(screen.getByRole('link', { name: /annonce d’origine/ })).toHaveAttribute('href', 'https://www.coinafrique.com/annonce/42');
  });

  it('les photos source sont des <img> simples, sans referrer, chargées à la demande — jamais next/image', async () => {
    await rendre(fiche({ photo_urls: ['https://img.example/a.jpg', 'javascript:alert(1)', 'https://img.example/b.jpg'] }));

    const photos = within(screen.getByTestId('radar-source')).getAllByRole('img');
    expect(photos).toHaveLength(2);
    for (const photo of photos) {
      expect(photo).toHaveAttribute('referrerpolicy', 'no-referrer');
      expect(photo).toHaveAttribute('loading', 'lazy');
      expect(photo.getAttribute('src')).toMatch(/^https:\/\/img\.example\//);
    }
  });

  it('une annonce de captures rend une image par capture, par son URL signée, sans surlignage', async () => {
    await rendre(fiche({
      source_kind: 'captures',
      raw_text: null,
      captures: [
        { id: 1, mime_type: 'image/png', size: 1000, sha256: 'a', url: 'https://api.test/media/1?signature=aaa' },
        { id: 2, mime_type: 'image/jpeg', size: 2000, sha256: 'b', url: 'https://api.test/media/2?signature=bbb' },
      ],
    }));

    const images = within(screen.getByTestId('radar-source')).getAllByRole('img');
    expect(images.map((i) => i.getAttribute('src'))).toEqual([
      'https://api.test/media/1?signature=aaa',
      'https://api.test/media/2?signature=bbb',
    ]);
    expect(images.every((i) => i.getAttribute('loading') === 'lazy')).toBe(true);

    // Rien à surligner : le passage cité s'affiche sous le champ.
    const user = userEvent.setup();
    await user.hover(screen.getByLabelText('Prix (XOF)'));
    expect(document.querySelector('mark')).toBeNull();
    expect(within(screen.getByTestId('champ-price')).getByText('Loyer : 350 000 FCFA')).toBeInTheDocument();
  });
});

describe('RadarListingFiche — passage cité et confiance (TCK-2387)', () => {
  it('survoler le champ prix entoure son passage d\'un <mark> et l\'amène à l\'écran ; le quitter le retire', async () => {
    await rendre();
    const user = userEvent.setup();
    expect(document.querySelector('mark')).toBeNull();

    await user.hover(screen.getByLabelText('Prix (XOF)'));
    const marque = document.querySelector('mark');
    expect(marque?.textContent).toBe('Loyer : 350 000 FCFA');
    // La page ne bouge jamais : seule la source défile (cf. la tâche de revue).
    expect(scrollIntoView).not.toHaveBeenCalled();

    await user.unhover(screen.getByLabelText('Prix (XOF)'));
    expect(document.querySelector('mark')).toBeNull();
    // Le texte, lui, reste entier.
    expect(screen.getByTestId('radar-source-text').textContent).toBe(TEXTE);
  });

  it('le focus clavier fait la même chose que le survol', async () => {
    await rendre();
    const prix = screen.getByLabelText('Prix (XOF)');

    act(() => prix.focus());
    expect(document.querySelector('mark')?.textContent).toBe('Loyer : 350 000 FCFA');
    // La page ne bouge jamais : seule la source défile (cf. la tâche de revue).
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => prix.blur());
    expect(document.querySelector('mark')).toBeNull();
  });

  it('un indice de nature se surligne aussi, au survol et au focus', async () => {
    await rendre();
    const indice = screen.getByRole('button', { name: /Contact par WhatsApp/ });

    act(() => indice.focus());
    expect(document.querySelector('mark')?.textContent).toBe('Contact via WhatsApp');
    act(() => indice.blur());
    expect(document.querySelector('mark')).toBeNull();

    // Sur un écran tactile, ni survol ni focus fiable : le clic suffit.
    await userEvent.click(indice);
    expect(document.querySelector('mark')?.textContent).toBe('Contact via WhatsApp');
  });

  it('un champ `low` à passage hors source porte son libellé et l\'avertissement ; un champ `high` n\'en porte aucun', async () => {
    await rendre();

    const chambres = screen.getByTestId('champ-bedrooms');
    expect(chambres).toHaveAttribute('data-alerte', 'true');
    expect(within(chambres).getByText('Le passage cité n’est pas dans la source')).toBeInTheDocument();
    // Le passage que le modèle cite, introuvable dans le texte, se lit sous le champ.
    expect(within(chambres).getByText('trois chambres')).toBeInTheDocument();

    const prix = screen.getByTestId('champ-price');
    expect(prix).not.toHaveAttribute('data-alerte');
    expect(within(prix).queryByText(/passage|bornes|invalide|illisible/i)).toBeNull();
    expect(within(prix).queryByText(/confiance/i)).toBeNull();
    expect(prix.querySelector('svg')).toBeNull();
  });

  it('`medium` est discret, et une valeur absente en `low` n\'alerte pas', async () => {
    await rendre();

    const periode = screen.getByTestId('champ-rent_period');
    expect(periode).not.toHaveAttribute('data-alerte');
    expect(within(periode).getByText('Confiance moyenne')).toBeInTheDocument();

    // La nature `unknown` est rendue en `low` sans drapeau : de l'ignorance, pas une alerte.
    expect(screen.getByTestId('champ-advertiser_nature')).not.toHaveAttribute('data-alerte');
  });

  it('un champ déjà corrigé affiche « corrigé » et ne s\'alarme plus', async () => {
    await rendre(fiche({
      extracted: { ...EXTRACTED, bedrooms: { value: 4, confidence: 'low', evidence: 'trois chambres', flags: [], corrected: true } },
    }));

    const chambres = screen.getByTestId('champ-bedrooms');
    expect(chambres).not.toHaveAttribute('data-alerte');
    expect(within(chambres).getByText('corrigé')).toBeInTheDocument();
  });
});

describe('RadarListingFiche — corrections (TCK-2387)', () => {
  it('corriger le prix puis « Enregistrer » envoie un PATCH à une seule clé', async () => {
    const apres = fiche({ extracted: { ...EXTRACTED, price: { ...EXTRACTED.price!, value: 400000, corrected: true } } });
    vi.mocked(patchRadarListing).mockResolvedValue({ data: apres });
    await rendre();
    // Le serveur suit l'écriture : l'enregistrement invalide tout le Radar, la fiche est relue.
    vi.mocked(fetchRadarListing).mockResolvedValue({ data: apres });
    const user = userEvent.setup();
    const enregistrer = screen.getByRole('button', { name: 'Enregistrer' });
    expect(enregistrer).toBeDisabled();

    const prix = screen.getByLabelText('Prix (XOF)');
    await user.clear(prix);
    await user.type(prix, '400000');
    expect(within(screen.getByTestId('champ-price')).getByText('corrigé')).toBeInTheDocument();
    await user.click(enregistrer);

    expect(patchRadarListing).toHaveBeenCalledTimes(1);
    expect(patchRadarListing).toHaveBeenCalledWith(42, { price: 400000 });
    expect(await screen.findByText('Corrections enregistrées.')).toBeInTheDocument();
    // Les rapprochements suivent : un prix corrigé peut en faire apparaître un.
    await vi.waitFor(() => expect(fetchRadarMatches).toHaveBeenCalledTimes(2));
    // La fiche relue remplace la lecture : le champ est « corrigé », plus rien en attente.
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByLabelText('Prix (XOF)')).toHaveValue(400000);
  });

  it('revenir à la valeur lue retire la correction : rien n\'est envoyé pour un champ inchangé', async () => {
    await rendre();
    const user = userEvent.setup();
    const prix = screen.getByLabelText('Prix (XOF)');

    await user.type(prix, '0');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
    await user.type(prix, '{Backspace}');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(patchRadarListing).not.toHaveBeenCalled();
  });

  it('vider un champ envoie null ; plusieurs corrections partent ensemble, et elles seules', async () => {
    vi.mocked(patchRadarListing).mockResolvedValue({ data: fiche() });
    await rendre();
    const user = userEvent.setup();

    await user.clear(screen.getByLabelText('Chambres'));
    await user.clear(screen.getByLabelText('Titre'));
    await user.type(screen.getByLabelText('Titre'), 'F3 aux Almadies');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(patchRadarListing).toHaveBeenCalledWith(42, { bedrooms: null, title: 'F3 aux Almadies' });
  });

  it('choisir une proposition de quartier envoie `{neighborhood_id}`', async () => {
    const apres = fiche({ neighborhood_link: { id: 12, name: 'Almadies', city: 'Dakar' } });
    vi.mocked(patchRadarListing).mockResolvedValue({ data: apres });
    await rendre();
    vi.mocked(fetchRadarListing).mockResolvedValue({ data: apres });
    const user = userEvent.setup();
    const proposition = screen.getByRole('button', { name: /Almadies \(Dakar\)/ });
    expect(proposition).toHaveAttribute('aria-pressed', 'false');

    await user.click(proposition);
    expect(proposition).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('radar-neighborhood-link')).toHaveTextContent('Quartier choisi, à enregistrer');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(patchRadarListing).toHaveBeenCalledWith(42, { neighborhood_id: 12 });
    expect(await screen.findByText('Rattaché à Almadies (Dakar)')).toBeInTheDocument();
  });

  it('à défaut de proposition, ville puis quartier du référentiel — approuvés seulement', async () => {
    vi.mocked(patchRadarListing).mockResolvedValue({ data: fiche() });
    await rendre(fiche({ extracted: { ...EXTRACTED, neighborhood: { ...EXTRACTED.neighborhood!, suggestions: [] } } }));
    const user = userEvent.setup();

    const quartier = screen.getByLabelText('Quartier du référentiel');
    expect(quartier).toBeDisabled();

    await user.click(screen.getByLabelText('Ville du référentiel'));
    await user.click(await screen.findByRole('option', { name: 'Dakar' }));
    expect(quartier).toBeEnabled();

    await user.click(quartier);
    expect(await screen.findByRole('option', { name: 'Mermoz' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Quartier proposé/ })).toBeNull();
    await user.click(screen.getByRole('option', { name: 'Mermoz' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(patchRadarListing).toHaveBeenCalledWith(42, { neighborhood_id: 13 });
  });

  it('un 409 `radar.listing.stage_conflict` s\'affiche par son libellé, pas par la prose du serveur', async () => {
    vi.mocked(patchRadarListing).mockRejectedValue(
      new ApiError(409, { code: 'radar.listing.stage_conflict', message: 'Conflict (prose)', params: { stage: 'reviewed' } }),
    );
    await rendre();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Prix (XOF)'), '0');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte).toHaveTextContent('Cette fiche a changé d’étape entre-temps ; rechargez-la.');
    expect(alerte).not.toHaveTextContent('prose');
    // La correction reste là : l'opérateur ne perd rien.
    expect(screen.getByLabelText('Prix (XOF)')).toHaveValue(3500000);
  });

  it('un 422 sans code lit les messages de validation', async () => {
    vi.mocked(patchRadarListing).mockRejectedValue(
      new ApiError(422, { message: 'invalide', errors: { price: ['Le prix doit être un entier.'] } }),
    );
    await rendre();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Prix (XOF)'), '0');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Le prix doit être un entier.');
  });

  it('une fiche qui n\'est plus `extracted` se lit seulement : pas d\'« Enregistrer », champs désactivés', async () => {
    await rendre(fiche({ stage: 'reviewed' }));

    expect(screen.getByTestId('radar-fiche-lecture-seule')).toHaveTextContent('étape : Relue');
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).toBeNull();
    expect(screen.getByLabelText('Prix (XOF)')).toBeDisabled();
  });
});

describe('RadarListingFiche — correctifs de revue de la Task 7 (TCK-2387)', () => {
  afterEach(() => vi.restoreAllMocks());

  const geometrie = (offsetTop: number) => {
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(offsetTop);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(20);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(100);
  };

  it('le passage cité défile la source SEULE : ni la fenêtre, ni `scrollIntoView`, sous `lg` comme au-dessus', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    geometrie(400);
    await rendre();
    const user = userEvent.setup();
    const source = screen.getByTestId('radar-source-text');
    expect(source.scrollTop).toBe(0);

    // Hors de vue (sous le bas de la zone, à 400 + 20 > 0 + 100) : la zone descend juste ce qu'il faut.
    await user.hover(screen.getByLabelText('Prix (XOF)'));
    expect(source.scrollTop).toBe(320);

    // Au-dessus de la zone visible : elle remonte jusqu'au passage.
    await user.unhover(screen.getByLabelText('Prix (XOF)'));
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(10);
    await user.hover(screen.getByLabelText('Prix (XOF)'));
    expect(source.scrollTop).toBe(10);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('un passage déjà visible ne déplace rien', async () => {
    geometrie(10);
    await rendre();
    const user = userEvent.setup();

    await user.hover(screen.getByLabelText('Prix (XOF)'));
    expect(screen.getByTestId('radar-source-text').scrollTop).toBe(0);
  });

  it('quitter un champ survolé rend le passage du champ qui garde le focus, au lieu de tout effacer', async () => {
    await rendre();
    const user = userEvent.setup();

    act(() => screen.getByLabelText('Prix (XOF)').focus());
    expect(document.querySelector('mark')?.textContent).toBe('Loyer : 350 000 FCFA');

    await user.hover(screen.getByLabelText('Titre'));
    expect(document.querySelector('mark')?.textContent).toBe('Appartement F3 à louer');

    await user.unhover(screen.getByLabelText('Titre'));
    expect(document.querySelector('mark')?.textContent).toBe('Loyer : 350 000 FCFA');

    act(() => screen.getByLabelText('Prix (XOF)').blur());
    expect(document.querySelector('mark')).toBeNull();
  });

  it('la surface accepte un décimal (`step="any"`), le prix commence à 1 comme l\'API, les entiers restent entiers', async () => {
    await rendre();

    expect(screen.getByLabelText('Surface (m²)')).toHaveAttribute('step', 'any');
    expect(screen.getByLabelText('Prix (XOF)')).toHaveAttribute('min', '1');
    expect(screen.getByLabelText('Prix (XOF)')).toHaveAttribute('step', '1');
    expect(screen.getByLabelText('Chambres')).toHaveAttribute('min', '0');
    expect(screen.getByLabelText('Chambres')).toHaveAttribute('step', '1');
  });

  it('un drapeau inconnu de ce front se lit par son code, jamais sous « Confiance faible »', async () => {
    await rendre(fiche({
      extracted: { ...EXTRACTED, title: { value: 'Appartement F3', confidence: 'high', evidence: null, flags: ['drapeau_neuf'] } },
    }));

    const titre = screen.getByTestId('champ-title');
    expect(titre).toHaveAttribute('data-alerte', 'true');
    expect(within(titre).getByText('drapeau_neuf')).toBeInTheDocument();
    expect(within(titre).queryByText('Confiance faible')).toBeNull();
  });

  it('un 409 `stage_conflict` fait relire la fiche, la correction en attente reste', async () => {
    vi.mocked(patchRadarListing).mockRejectedValue(new ApiError(409, { code: 'radar.listing.stage_conflict', message: 'x' }));
    await rendre();
    const user = userEvent.setup();
    expect(fetchRadarListing).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('Prix (XOF)'), '0');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await vi.waitFor(() => expect(fetchRadarListing).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Prix (XOF)')).toHaveValue(3500000);
  });

  it('un autre refus ne relit pas la fiche', async () => {
    vi.mocked(patchRadarListing).mockRejectedValue(new ApiError(422, { message: 'invalide', errors: { price: ['x'] } }));
    await rendre();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Prix (XOF)'), '0');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await screen.findByRole('alert');
    expect(fetchRadarListing).toHaveBeenCalledTimes(1);
  });

  it('les deux listes du quartier sont décrites par la note du champ (`aria-describedby`)', async () => {
    await rendre();

    const groupe = screen.getByTestId('champ-neighborhood');
    const note = groupe.querySelector('[id$="-note"]');
    expect(note).not.toBeNull();
    for (const nom of ['Ville du référentiel', 'Quartier du référentiel']) {
      expect(screen.getByLabelText(nom)).toHaveAttribute('aria-describedby', note!.id);
    }
  });
});

