import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  claimRadarAdvertiser,
  deleteRadarListingPhoto,
  fetchRadarAdvertiser,
  fetchRadarPublicationPreview,
  fetchRadarPublishedMessage,
  publishRadarAdvertiser,
  refetchRadarListingPhotos,
  releaseRadarAdvertiser,
  uploadRadarListingPhotos,
} from '@/lib/queries/radar';
import { PLATFORM_ABILITIES } from '@/lib/platform-abilities';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarAdvertiserDetail, RadarPublicationPreview } from '@/types/radar';
import { annonceur, prise } from '../../annonceur/__tests__/mocks';
import { RadarPublication } from '../RadarPublication';
import { annonce, apercu, messagePublie, publiee, WA_ME_PUBLIE } from './mocks';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  fetchRadarAdvertiser: vi.fn(),
  claimRadarAdvertiser: vi.fn(),
  releaseRadarAdvertiser: vi.fn(),
  fetchRadarPublicationPreview: vi.fn(),
  publishRadarAdvertiser: vi.fn(),
  fetchRadarPublishedMessage: vi.fn(),
  refetchRadarListingPhotos: vi.fn(),
  uploadRadarListingPhotos: vi.fn(),
  deleteRadarListingPhoto: vi.fn(),
}));

/** L'aperçu que l'« API » rend : un test le change pour que la relecture porte le nouvel état. */
let serveur: RadarPublicationPreview;
/** La fiche de l'annonceur que l'« API » rend : elle porte la prise en charge (à soi par défaut). */
let fiche: RadarAdvertiserDetail;

async function rendre(
  detail: RadarPublicationPreview = apercu(),
  gestes?: Parameters<typeof avecGestes>[1],
  ficheDeLAnnonceur: RadarAdvertiserDetail = annonceur(),
) {
  serveur = detail;
  fiche = ficheDeLAnnonceur;
  vi.mocked(fetchRadarPublicationPreview).mockImplementation(async () => ({ data: serveur }));
  vi.mocked(fetchRadarAdvertiser).mockImplementation(async () => ({ data: fiche }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<RadarPublication id={7} />, gestes)}
    </QueryClientProvider>,
  ));
  if (gestes === undefined) await screen.findByTestId('radar-publication');
  return { utilisateur: userEvent.setup(), queryClient };
}

const publier = () => screen.getByRole('button', { name: /^Publier \d+ annonces?$|^Publier$/ });

beforeEach(() => {
  vi.mocked(fetchRadarAdvertiser).mockReset();
  vi.mocked(claimRadarAdvertiser).mockReset();
  vi.mocked(releaseRadarAdvertiser).mockReset();
  vi.mocked(fetchRadarPublicationPreview).mockReset();
  vi.mocked(publishRadarAdvertiser).mockReset();
  vi.mocked(fetchRadarPublishedMessage).mockReset();
  vi.mocked(refetchRadarListingPhotos).mockReset();
  vi.mocked(uploadRadarListingPhotos).mockReset();
  vi.mocked(deleteRadarListingPhoto).mockReset();
  vi.mocked(fetchRadarPublishedMessage).mockResolvedValue({ data: messagePublie() });
});

afterEach(() => vi.useRealTimers());

describe('RadarPublication — la vérification (TCK-2389)', () => {
  it('dit ce qui sera créé au nom de l\'annonceur : compte, numéro, espace', async () => {
    await rendre();

    const compte = screen.getByTestId('radar-publication-compte');
    expect(within(compte).getByRole('heading', { name: 'Ce qui sera créé au nom de Moussa Immo' })).toBeInTheDocument();
    expect(within(compte).getByText('Un compte sans mot de passe, créé pour l’occasion')).toBeInTheDocument();
    expect(within(compte).getByText('Moussa Immo', { selector: 'dd' })).toBeInTheDocument();
    expect(within(compte).getByText('+221771234567')).toBeInTheDocument();
    expect(within(compte).getByText('Espace de Moussa')).toBeInTheDocument();
  });

  it('un compte déjà rattaché est dit « existant » : aucun espace neuf n\'est annoncé', async () => {
    await rendre(apercu({ account: { exists: true, first_name: 'Moussa', last_name: 'Immo', phone: '+221771234567', space_name: 'Espace de Moussa' } }));

    const compte = screen.getByTestId('radar-publication-compte');
    expect(within(compte).getByText('Compte existant, repris tel quel')).toBeInTheDocument();
    expect(within(compte).queryByText('Espace de Moussa')).not.toBeInTheDocument();
  });

  it('une carte par annonce couverte, cochée par défaut, avec titre, prix, quartier et photos', async () => {
    await rendre();

    const carte = screen.getByTestId('radar-publication-carte-12');
    expect(within(carte).getByText('Appartement 12')).toBeInTheDocument();
    expect(within(carte).getByText(/350\s?000/)).toBeInTheDocument();
    expect(within(carte).getByText(/Almadies/)).toBeInTheDocument();
    expect(within(carte).getByRole('checkbox', { name: 'Publier l’annonce n° 12' })).toBeChecked();
    expect(within(carte).getAllByRole('img')).toHaveLength(2);
    expect(within(carte).getByRole('link', { name: 'Ouvrir la fiche de l’annonce n° 12' })).toHaveAttribute('href', '/super-admin/radar/12');
    expect(publier()).toHaveTextContent('Publier 2 annonces');
  });

  it('une annonce sans titre montre le titre construit qui sera publié, et le signale ; un titre d\'annonce ne porte aucun signe', async () => {
    await rendre(apercu({
      listings: [
        annonce(12, { title: 'Appartement 3 chambres à louer — Almadies', title_built: true }),
        annonce(13),
      ],
    }));

    const construite = screen.getByTestId('radar-publication-carte-12');
    expect(within(construite).getByText(/Appartement 3 chambres à louer — Almadies/)).toBeInTheDocument();
    expect(within(construite).getByTestId('radar-publication-titre-construit-12')).toHaveTextContent('Titre construit');
    expect(within(construite).getByText(/Cette annonce n’a pas de titre : celui-ci est construit/)).toBeInTheDocument();
    const propre = screen.getByTestId('radar-publication-carte-13');
    expect(within(propre).queryByTestId('radar-publication-titre-construit-13')).not.toBeInTheDocument();
    expect(within(propre).queryByText(/n’a pas de titre/)).not.toBeInTheDocument();
  });

  it('une annonce bloquée n\'est pas cochée, ne se coche pas, et dit pourquoi', async () => {
    const { utilisateur } = await rendre(apercu({
      listings: [annonce(12), annonce(13, { photos: [], blocking: ['radar.publish.no_photo', 'radar.publish.missing_field'] })],
    }));

    const carte = screen.getByTestId('radar-publication-carte-13');
    const case13 = within(carte).getByRole('checkbox', { name: 'Publier l’annonce n° 13' });
    expect(case13).not.toBeChecked();
    expect(case13).toBeDisabled();
    const blocages = within(carte).getByTestId('radar-publication-blocages-13');
    // La carte ne parle que d'une annonce : « Cette annonce… », jamais le « Une annonce… » du refus d'un envoi.
    expect(within(blocages).getByText(/^Cette annonce n’a aucune photo dans sa réserve : récupérez-en à la source/)).toBeInTheDocument();
    expect(within(blocages).getByText(/^Cette annonce est incomplète/)).toBeInTheDocument();
    expect(within(blocages).queryByText(/^Une annonce/)).not.toBeInTheDocument();
    await utilisateur.click(case13);
    expect(case13).not.toBeChecked();
    expect(publier()).toHaveTextContent('Publier 1 annonce');
  });

  it('une sélection au-delà du plafond de photos refuse la confirmation, dit le nombre, et se rouvre en décochant', async () => {
    const { utilisateur } = await rendre(apercu({ max_photos: 3 }));

    expect(publier()).toBeDisabled();
    expect(screen.getByTestId('radar-publication-plafond')).toHaveTextContent(
      'La sélection compte 4 photos : une publication en accepte 3 au plus. Décochez des annonces, puis publiez-les en plusieurs fois.',
    );

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 13' }));

    expect(screen.queryByTestId('radar-publication-plafond')).not.toBeInTheDocument();
    expect(publier()).toBeEnabled();
  });

  it('au plafond exactement, « Publier » reste ouvert', async () => {
    await rendre(apercu({ max_photos: 4 }));

    expect(screen.queryByTestId('radar-publication-plafond')).not.toBeInTheDocument();
    expect(publier()).toBeEnabled();
  });

  it('décocher la dernière annonce désactive « Publier »', async () => {
    const { utilisateur } = await rendre(apercu({ listings: [annonce(12)] }));

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 12' }));

    expect(publier()).toBeDisabled();
    expect(screen.getByText('Cochez au moins une annonce à publier.')).toBeInTheDocument();
  });

  it('un blocage global se lit en alerte, avec son libellé, et ferme tout', async () => {
    await rendre(apercu({ blocking: ['radar.advertiser.phone_registered'] }));

    const alerte = screen.getByTestId('radar-publication-blocage');
    expect(alerte).toHaveAttribute('role', 'alert');
    expect(within(alerte).getByText(/déjà celui d’un compte/)).toBeInTheDocument();
    expect(publier()).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 12' })).toBeDisabled();
  });

  it('sans connexion par téléphone, le blocage global le dit et ferme tout', async () => {
    await rendre(apercu({ blocking: ['radar.publish.activation_unavailable'] }));

    const alerte = screen.getByTestId('radar-publication-blocage');
    expect(within(alerte).getByText(/La connexion par téléphone est éteinte dans cet environnement/)).toBeInTheDocument();
    expect(publier()).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 12' })).toBeDisabled();
  });

  it('aucune annonce couverte : rien à publier, et le blocage le dit', async () => {
    await rendre(apercu({ listings: [], blocking: ['radar.publish.nothing_covered'] }));

    expect(screen.getByText(/Aucune annonce n’est couverte par un accord valide : il n’y a rien à publier/)).toBeInTheDocument();
    expect(within(screen.getByTestId('radar-publication-blocage')).getByText('Aucune annonce de cet annonceur n’est couverte par un accord valide.')).toBeInTheDocument();
    expect(publier()).toBeDisabled();
  });

  it('un rapprochement ou un doublon alerte sur la carte', async () => {
    await rendre(apercu({
      listings: [annonce(12, {
        matches: [{ kind: 'property', id: 88, signals: [] }, { kind: 'listing', id: 15, signals: [] }],
        duplicate_of_property_id: 88,
      })],
    }));

    const alerte = screen.getByTestId('radar-publication-alerte-12');
    // Un contenu statique : le rôle « alert » s'annoncerait à chaque relecture de l'aperçu, pour toutes les cartes à la fois.
    expect(alerte).not.toHaveAttribute('role');
    expect(within(alerte).getByText('Ressemble déjà à : le bien n° 88, l’annonce n° 15.')).toBeInTheDocument();
    expect(within(alerte).getByText('Marquée comme doublon du bien n° 88.')).toBeInTheDocument();
  });

  it('sans le geste « publier », l\'écran ne s\'ouvre pas et rien n\'est lu', async () => {
    await rendre(apercu(), { level: 'support', abilities: PLATFORM_ABILITIES.filter((g) => g !== 'platform.radar.publish') });

    expect(await screen.findByText('Publier pour un annonceur est réservé aux super-administrateurs.')).toBeInTheDocument();
    expect(fetchRadarPublicationPreview).not.toHaveBeenCalled();
  });

  it('un aperçu illisible se dit, et se relit', async () => {
    vi.mocked(fetchRadarAdvertiser).mockResolvedValue({ data: annonceur() });
    vi.mocked(fetchRadarPublicationPreview).mockRejectedValue(new ApiError(500, { code: 'server_error' }));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RadarPublication id={7} />)}</QueryClientProvider>));

    expect(await screen.findByText(/Impossible de charger l’aperçu de la publication/)).toBeInTheDocument();
  });
});

describe('RadarPublication — la réserve de photos (TCK-2389)', () => {
  it('retirer une photo appelle l\'API, puis relit l\'aperçu', async () => {
    vi.mocked(deleteRadarListingPhoto).mockResolvedValue(undefined);
    const { utilisateur } = await rendre();
    const lectures = vi.mocked(fetchRadarPublicationPreview).mock.calls.length;

    await utilisateur.click(screen.getByRole('button', { name: 'Retirer la photo 1 de l’annonce n° 12' }));

    await waitFor(() => expect(deleteRadarListingPhoto).toHaveBeenCalledWith(12, 121));
    await waitFor(() => expect(vi.mocked(fetchRadarPublicationPreview).mock.calls.length).toBeGreaterThan(lectures));
  });

  it('déposer des photos les envoie, en lots de dix au plus', async () => {
    vi.mocked(uploadRadarListingPhotos).mockResolvedValue({ data: {} } as never);
    const { utilisateur } = await rendre();
    const fichiers = Array.from({ length: 12 }, (_, i) => new File([`${i}`], `p${i}.jpg`, { type: 'image/jpeg' }));

    await utilisateur.upload(screen.getByTestId('radar-publication-depot-12'), fichiers);

    await waitFor(() => expect(uploadRadarListingPhotos).toHaveBeenCalledTimes(2));
    expect(vi.mocked(uploadRadarListingPhotos).mock.calls[0]).toEqual([12, fichiers.slice(0, 10)]);
    expect(vi.mocked(uploadRadarListingPhotos).mock.calls[1]).toEqual([12, fichiers.slice(10)]);
  });

  it('« Récupérer les photos de la source » relance la lecture', async () => {
    vi.mocked(refetchRadarListingPhotos).mockResolvedValue({ data: {} } as never);
    const { utilisateur } = await rendre();

    await utilisateur.click(within(screen.getByTestId('radar-publication-carte-12')).getByRole('button', { name: 'Récupérer les photos de la source' }));

    await waitFor(() => expect(refetchRadarListingPhotos).toHaveBeenCalledWith(12));
  });

  it('sans photo à lire à la source, la relance n\'est pas offerte', async () => {
    await rendre(apercu({ listings: [annonce(12, { photo_preparation: { status: 'none', total: 0, done: 0 } })] }));

    expect(within(screen.getByTestId('radar-publication-carte-12')).queryByRole('button', { name: 'Récupérer les photos de la source' })).not.toBeInTheDocument();
  });

  it('pendant la préparation, la relance reste active : un `pending` sans job n\'a pas d\'autre issue', async () => {
    vi.mocked(refetchRadarListingPhotos).mockResolvedValue({ data: {} } as never);
    const { utilisateur } = await rendre(apercu({
      listings: [annonce(13, { photos: [], photo_preparation: { status: 'pending', total: 3, done: 1 }, blocking: ['radar.publish.photos_pending'] })],
    }));

    const carte = screen.getByTestId('radar-publication-carte-13');
    expect(within(carte).getByTestId('radar-publication-preparation-13')).toHaveTextContent('Lecture des photos de la source : 1 sur 3.');
    const relance = within(carte).getByRole('button', { name: 'Récupérer les photos de la source' });
    expect(relance).toBeEnabled();

    await utilisateur.click(relance);

    await waitFor(() => expect(refetchRadarListingPhotos).toHaveBeenCalledWith(13));
  });

  it('une annonce sans photo à la source ne propose que le dépôt : ni texte ni bouton ne parlent de « récupérer »', async () => {
    await rendre(apercu({
      listings: [annonce(13, {
        photos: [],
        photo_preparation: { status: 'none', total: 0, done: 0 },
        blocking: ['radar.publish.no_photo'],
      })],
    }));

    const carte = screen.getByTestId('radar-publication-carte-13');
    expect(within(carte).getAllByText('Cette annonce n’a aucune photo à la source : déposez-en à la main.')).toHaveLength(1);
    expect(within(carte).getByText('Aucune photo à la source : déposez-en à la main.')).toBeInTheDocument();
    expect(within(carte).queryByText(/récupérez/i)).not.toBeInTheDocument();
    expect(within(carte).queryByRole('button', { name: 'Récupérer les photos de la source' })).not.toBeInTheDocument();
    expect(within(carte).getByRole('button', { name: 'Déposer des photos' })).toBeEnabled();
  });

  it('une annonce dont la source a des photos, mais dont la réserve est vide, propose de les récupérer', async () => {
    await rendre(apercu({
      listings: [annonce(13, {
        photos: [],
        photo_preparation: { status: 'done', total: 3, done: 0 },
        blocking: ['radar.publish.no_photo'],
      })],
    }));

    const carte = screen.getByTestId('radar-publication-carte-13');
    expect(within(carte).getByText('Aucune photo : récupérez celles de la source, ou déposez-en à la main.')).toBeInTheDocument();
    expect(within(carte).getByRole('button', { name: 'Récupérer les photos de la source' })).toBeEnabled();
  });

  it('une réserve pleine ferme le dépôt', async () => {
    const photos = Array.from({ length: 20 }, (_, i) => ({ id: 900 + i, url: `https://media.takussan.test/${i}.jpg` }));
    await rendre(apercu({ listings: [annonce(12, { photos })] }));

    expect(within(screen.getByTestId('radar-publication-carte-12')).getByRole('button', { name: 'Déposer des photos' })).toBeDisabled();
    expect(screen.getByText('La réserve est pleine : 20 photos au plus.')).toBeInTheDocument();
  });

  it('un refus de la réserve se dit par son code, et l\'aperçu se relit sur un 422', async () => {
    vi.mocked(deleteRadarListingPhoto).mockRejectedValue(new ApiError(422, { code: 'radar.photo.not_found' }));
    const { utilisateur } = await rendre();
    const lectures = vi.mocked(fetchRadarPublicationPreview).mock.calls.length;

    await utilisateur.click(screen.getByRole('button', { name: 'Retirer la photo 1 de l’annonce n° 12' }));

    expect(await screen.findByText('Cette photo n’est pas dans la réserve de cette annonce.')).toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(fetchRadarPublicationPreview).mock.calls.length).toBeGreaterThan(lectures));
  });

  it('une préparation en cours relit l\'aperçu à son rythme', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await rendre(apercu({ listings: [annonce(12, { photos: [], photo_preparation: { status: 'pending', total: 2, done: 0 }, blocking: ['radar.publish.photos_pending'] })] }));
    const lectures = vi.mocked(fetchRadarPublicationPreview).mock.calls.length;

    await vi.advanceTimersByTimeAsync(10_500);

    await waitFor(() => expect(vi.mocked(fetchRadarPublicationPreview).mock.calls.length).toBeGreaterThan(lectures));
  });
});

describe('RadarPublication — la confirmation et le récapitulatif (TCK-2389)', () => {
  async function ouvrirLaConfirmation(detail?: RadarPublicationPreview) {
    const rendu = await rendre(detail);
    await rendu.utilisateur.click(publier());
    const dialogue = await screen.findByRole('dialog');
    return { ...rendu, dialogue };
  }

  it('la confirmation récapitule : 1 compte, 1 espace, N biens avec M photos', async () => {
    const { dialogue } = await ouvrirLaConfirmation();

    expect(within(dialogue).getByTestId('radar-publication-resume')).toHaveTextContent('1 compte, 1 espace, 2 biens publiés avec 4 photos.');
    expect(publishRadarAdvertiser).not.toHaveBeenCalled();
  });

  it('un compte existant est repris, et le résumé ne compte que les annonces cochées', async () => {
    const detail = apercu({ account: { exists: true, first_name: 'Moussa', last_name: 'Immo', phone: '+221771234567', space_name: 'x' } });
    const { utilisateur } = await rendre(detail);
    await utilisateur.click(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 13' }));
    await utilisateur.click(publier());

    expect(within(await screen.findByRole('dialog')).getByTestId('radar-publication-resume'))
      .toHaveTextContent('Compte existant repris, 1 bien publié avec 2 photos.');
  });

  it('annuler ferme sans rien publier', async () => {
    const { utilisateur, dialogue } = await ouvrirLaConfirmation();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(publishRadarAdvertiser).not.toHaveBeenCalled();
  });

  it('publier envoie les annonces cochées sous une Idempotency-Key, puis rend le récapitulatif', async () => {
    vi.mocked(publishRadarAdvertiser).mockResolvedValue({ data: publiee() });
    const { utilisateur, dialogue } = await ouvrirLaConfirmation();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));

    const recap = await screen.findByTestId('radar-publication-recap');
    expect(publishRadarAdvertiser).toHaveBeenCalledTimes(1);
    const [id, ids, cle] = vi.mocked(publishRadarAdvertiser).mock.calls[0];
    expect([id, ids]).toEqual([7, [12, 13]]);
    expect(cle).toMatch(/^[0-9a-f-]{36}$/);
    expect(within(recap).getByTestId('radar-publication-recap-compte')).toHaveTextContent('Compte créé pour Moussa Immo, avec l’espace « Espace de Moussa ».');
    const liens = within(recap).getByRole('list', { name: 'Liens publics des biens publiés' });
    expect(within(liens).getByRole('link', { name: 'Appartement 12' })).toHaveAttribute('href', 'https://takussan.test/fr/properties/appartement-12');
    expect(within(liens).getByRole('link', { name: 'Appartement 13' })).toHaveAttribute('href', 'https://takussan.test/fr/properties/appartement-13');
  });

  it('le récapitulatif porte le second message : texte, WhatsApp, copie, et la langue se change', async () => {
    vi.mocked(publishRadarAdvertiser).mockResolvedValue({ data: publiee() });
    const ecrire = vi.fn().mockResolvedValue(undefined);
    const { utilisateur, dialogue } = await ouvrirLaConfirmation();
    // Après `userEvent.setup()` : il remplace `navigator.clipboard` par le sien.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: ecrire }, configurable: true });
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));

    const message = await screen.findByTestId('radar-publication-message');
    expect(await within(message).findByTestId('radar-publication-message-texte')).toHaveTextContent(/vos annonces sont en ligne/);
    expect(fetchRadarPublishedMessage).toHaveBeenCalledWith(7, 'fr');
    expect(within(message).getByRole('link', { name: 'Ouvrir WhatsApp' })).toHaveAttribute('href', WA_ME_PUBLIE);
    // Une URL longue ne se coupe pas à droite du cadre : le texte fixe se replie n'importe où.
    expect(within(message).getByTestId('radar-publication-message-texte').className).toMatch(/break-words.*overflow-wrap:anywhere/);

    await utilisateur.click(within(message).getByRole('button', { name: 'Copier le message' }));
    await waitFor(() => expect(ecrire).toHaveBeenCalledWith(messagePublie().text));
    expect(within(message).getByText('Message copié.')).toBeInTheDocument();

    await utilisateur.click(within(message).getByRole('radio', { name: 'Anglais' }));
    await waitFor(() => expect(fetchRadarPublishedMessage).toHaveBeenCalledWith(7, 'en'));
  });

  it('un refus garde le dialogue ouvert, dit le code, et relit l\'aperçu', async () => {
    vi.mocked(publishRadarAdvertiser).mockRejectedValue(new ApiError(422, { code: 'radar.publish.not_covered', params: { listing_ids: [13] } }));
    const { utilisateur, dialogue } = await ouvrirLaConfirmation();
    const lectures = vi.mocked(fetchRadarPublicationPreview).mock.calls.length;

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));

    const erreur = await within(dialogue).findByTestId('radar-publication-confirm-erreur');
    expect(erreur).toHaveAttribute('role', 'alert');
    expect(erreur).toHaveTextContent(/n’est pas couverte par un accord confirmé et non révoqué/);
    expect(screen.queryByTestId('radar-publication-recap')).not.toBeInTheDocument();
    await waitFor(() => expect(vi.mocked(fetchRadarPublicationPreview).mock.calls.length).toBeGreaterThan(lectures));
  });

  it('un 422 `too_many_photos` de l\'API se dit avec le nombre et le plafond de ses paramètres', async () => {
    vi.mocked(publishRadarAdvertiser).mockRejectedValue(new ApiError(422, { code: 'radar.publish.too_many_photos', params: { count: 40, max: 30 } }));
    const { utilisateur, dialogue } = await ouvrirLaConfirmation();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));

    expect(await within(dialogue).findByText('Ces annonces ont 40 photos en tout, et une publication en accepte 30 au plus : publiez-les en plusieurs fois.')).toBeInTheDocument();
  });

  it('le quota de l\'espace se dit par son code', async () => {
    vi.mocked(publishRadarAdvertiser).mockRejectedValue(new ApiError(422, { code: 'quota.listings_exceeded' }));
    const { utilisateur, dialogue } = await ouvrirLaConfirmation();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));

    expect(await within(dialogue).findByText(/quota d’annonces actives/)).toBeInTheDocument();
  });

  it('un réessai après une panne repart sous la MÊME clé', async () => {
    vi.mocked(publishRadarAdvertiser)
      .mockRejectedValueOnce(new ApiError(502, { code: 'upstream_unavailable' }))
      .mockResolvedValueOnce({ data: publiee() });
    const { utilisateur, dialogue } = await ouvrirLaConfirmation();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));
    await within(dialogue).findByTestId('radar-publication-confirm-erreur');
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));
    await screen.findByTestId('radar-publication-recap');

    const cles = vi.mocked(publishRadarAdvertiser).mock.calls.map((appel) => appel[2]);
    expect(cles).toHaveLength(2);
    expect(cles[0]).toBe(cles[1]);
  });

  it('un 422 `idempotency.key_reused` renouvelle la clé : le réessai ne rejoue pas l\'ancienne réponse', async () => {
    vi.mocked(publishRadarAdvertiser)
      .mockRejectedValueOnce(new ApiError(422, { code: 'idempotency.key_reused' }))
      .mockResolvedValueOnce({ data: publiee() });
    const { utilisateur, dialogue } = await ouvrirLaConfirmation();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));
    expect(await within(dialogue).findByText(/La sélection a changé depuis un premier envoi/)).toBeInTheDocument();
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));
    await screen.findByTestId('radar-publication-recap');

    const cles = vi.mocked(publishRadarAdvertiser).mock.calls.map((appel) => appel[2]);
    expect(cles[0]).not.toBe(cles[1]);
  });

  it('le dialogue ne se ferme pas pendant l\'envoi, et « Publier » y est fermé', async () => {
    let finir: (v: { data: ReturnType<typeof publiee> }) => void = () => undefined;
    vi.mocked(publishRadarAdvertiser).mockImplementation(() => new Promise((resolve) => { finir = resolve; }));
    const { utilisateur, dialogue } = await ouvrirLaConfirmation();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));

    const envoi = await within(dialogue).findByRole('button', { name: 'Publication…' });
    expect(envoi).toBeDisabled();
    expect(within(dialogue).getByRole('button', { name: 'Annuler' })).toBeDisabled();
    expect(publishRadarAdvertiser).toHaveBeenCalledTimes(1);
    finir({ data: publiee() });
    await screen.findByTestId('radar-publication-recap');
  });
});

describe('RadarPublication — la prise en charge (TCK-2389)', () => {
  const libre = () => annonceur({ claim: null });
  const prisePar = () => annonceur({ claim: prise({ mine: false, by: { id: 9, name: 'Ibou Fall' } }) });

  it('à soi : le bandeau le dit, les gestes sont ouverts, aucune consigne de prise', async () => {
    await rendre();

    expect(screen.getByTestId('radar-annonceur-prise')).toHaveAttribute('data-etat', 'moi');
    expect(screen.getByTestId('radar-annonceur-prise')).toHaveTextContent('Vous traitez cet annonceur');
    expect(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 12' })).toBeEnabled();
    expect(publier()).toBeEnabled();
  });

  it('à personne : on peut la prendre, tout le reste est fermé jusque-là, puis s\'ouvre', async () => {
    vi.mocked(claimRadarAdvertiser).mockImplementation(async () => {
      fiche = annonceur({ claim: prise() });
      return { data: { claim: prise() } };
    });
    const { utilisateur } = await rendre(apercu(), undefined, libre());

    expect(screen.getByTestId('radar-annonceur-prise')).toHaveAttribute('data-etat', 'libre');
    // Un seul texte, celui du bandeau, propre à la publication : pas celui de la fiche (« préparer un message »).
    expect(screen.getByTestId('radar-annonceur-prise')).toHaveTextContent('Personne ne traite cet annonceur. Prenez-le en charge pour déposer des photos et publier.');
    expect(screen.getByTestId('radar-annonceur-prise')).not.toHaveTextContent('préparer un message');
    expect(screen.queryByText(/chaque geste de cet écran l’exige/)).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 12' })).toBeDisabled();
    expect(publier()).toBeDisabled();
    expect(within(screen.getByTestId('radar-publication-carte-12')).getByRole('button', { name: 'Retirer la photo 1 de l’annonce n° 12' })).toBeDisabled();

    await utilisateur.click(screen.getByRole('button', { name: 'Prendre en charge' }));

    await waitFor(() => expect(claimRadarAdvertiser).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 12' })).toBeEnabled());
    expect(publier()).toBeEnabled();
  });

  it('prise par un autre : le bandeau le nomme, rien ne se prend, tout reste fermé', async () => {
    await rendre(apercu(), undefined, prisePar());

    expect(screen.getByTestId('radar-annonceur-prise')).toHaveAttribute('data-etat', 'autre');
    expect(screen.getByTestId('radar-annonceur-prise')).toHaveTextContent('Ibou Fall');
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();
    expect(publier()).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 12' })).toBeDisabled();
  });

  it('sous STOP : « Prendre en charge » reste fermé', async () => {
    await rendre(
      apercu({ advertiser: { ...apercu().advertiser, do_not_contact_at: '2026-10-28T09:00:00+00:00' }, blocking: ['radar.advertiser.do_not_contact'] }),
      undefined,
      annonceur({ claim: null, do_not_contact_at: '2026-10-28T09:00:00+00:00' }),
    );

    expect(screen.getByRole('button', { name: 'Prendre en charge' })).toBeDisabled();
  });

  it('la prise se renouvelle d\'elle-même pendant que l\'opérateur travaille sur cet écran', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(claimRadarAdvertiser).mockResolvedValue({ data: { claim: prise() } });
    await rendre(apercu(), undefined, annonceur({ claim: prise({ until: new Date(Date.now() + 20_000).toISOString() }) }));
    expect(claimRadarAdvertiser).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_500);

    await waitFor(() => expect(claimRadarAdvertiser).toHaveBeenCalledWith(7));
  });

  it('une prise qui n\'est pas à soi ne se renouvelle pas', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await rendre(apercu(), undefined, annonceur({ claim: prise({ mine: false, until: new Date(Date.now() + 20_000).toISOString() }) }));

    await vi.advanceTimersByTimeAsync(15_000);

    expect(claimRadarAdvertiser).not.toHaveBeenCalled();
  });

  it('un 409 `claim_required` sur un geste de la réserve : on reprend la prise, puis on rejoue le geste', async () => {
    vi.mocked(deleteRadarListingPhoto)
      .mockRejectedValueOnce(new ApiError(409, { code: 'radar.advertiser.claim_required' }))
      .mockResolvedValueOnce(undefined);
    vi.mocked(claimRadarAdvertiser).mockResolvedValue({ data: { claim: prise() } });
    const { utilisateur } = await rendre();

    await utilisateur.click(screen.getByRole('button', { name: 'Retirer la photo 1 de l’annonce n° 12' }));

    await waitFor(() => expect(deleteRadarListingPhoto).toHaveBeenCalledTimes(2));
    expect(claimRadarAdvertiser).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deleteRadarListingPhoto).mock.calls[1]).toEqual([12, 121]);
    expect(screen.queryByTestId('radar-publication-erreur')).not.toBeInTheDocument();
  });

  it('un 409 `claim_required` sur « Publier » : reprise, puis même envoi sous la MÊME clé', async () => {
    vi.mocked(publishRadarAdvertiser)
      .mockRejectedValueOnce(new ApiError(409, { code: 'radar.advertiser.claim_required' }))
      .mockResolvedValueOnce({ data: publiee() });
    vi.mocked(claimRadarAdvertiser).mockResolvedValue({ data: { claim: prise() } });
    const { utilisateur } = await rendre();
    await utilisateur.click(publier());

    await utilisateur.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publier' }));

    await screen.findByTestId('radar-publication-recap');
    expect(claimRadarAdvertiser).toHaveBeenCalledTimes(1);
    const appels = vi.mocked(publishRadarAdvertiser).mock.calls;
    expect(appels).toHaveLength(2);
    expect(appels[0][2]).toBe(appels[1][2]);
  });

  it('une prise reprise par un autre entre-temps : le refus se dit, rien n\'est rejoué', async () => {
    vi.mocked(deleteRadarListingPhoto).mockRejectedValue(new ApiError(409, { code: 'radar.advertiser.claim_required' }));
    vi.mocked(claimRadarAdvertiser).mockRejectedValue(new ApiError(409, { code: 'radar.advertiser.claimed_by_other', params: { claimed_until: '2026-10-29T10:00:00+00:00' } }));
    const { utilisateur } = await rendre();

    await utilisateur.click(screen.getByRole('button', { name: 'Retirer la photo 1 de l’annonce n° 12' }));

    expect(await screen.findByTestId('radar-publication-erreur')).toHaveTextContent(/un autre opérateur/i);
    expect(deleteRadarListingPhoto).toHaveBeenCalledTimes(1);
  });
});

describe('RadarPublication — le second message ne se perd pas (TCK-2389)', () => {
  const enCours = () => new ApiError(409, { code: 'idempotency.in_progress' });

  it('un envoi « encore en cours » se rejoue sous la MÊME clé jusqu\'à la réponse enregistrée, sans relire l\'aperçu', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(publishRadarAdvertiser)
      .mockRejectedValueOnce(enCours())
      .mockRejectedValueOnce(enCours())
      .mockResolvedValueOnce({ data: publiee() });
    const rendu = await rendre();
    const lectures = vi.mocked(fetchRadarPublicationPreview).mock.calls.length;
    await rendu.utilisateur.click(publier());
    await rendu.utilisateur.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Publier' }));

    await waitFor(() => expect(publishRadarAdvertiser).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('radar-publication-recap')).not.toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(3_100);
    await waitFor(() => expect(publishRadarAdvertiser).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(3_100);

    expect(await screen.findByTestId('radar-publication-recap')).toBeInTheDocument();
    const cles = vi.mocked(publishRadarAdvertiser).mock.calls.map((appel) => appel[2]);
    expect(new Set(cles).size).toBe(1);
    expect(cles).toHaveLength(3);
    // Les refus « en cours » n'ont pas relu l'aperçu : une seule relecture, celle du succès.
    expect(vi.mocked(fetchRadarPublicationPreview).mock.calls.length - lectures).toBeLessThanOrEqual(1);
  });

  it('un envoi qui reste « en cours » passé la borne le dit, garde le dialogue et la clé, et ne relit pas l\'aperçu', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.mocked(publishRadarAdvertiser).mockRejectedValue(enCours());
    const rendu = await rendre();
    const lectures = vi.mocked(fetchRadarPublicationPreview).mock.calls.length;
    await rendu.utilisateur.click(publier());
    const dialogue = await screen.findByRole('dialog');
    await rendu.utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));

    await vi.advanceTimersByTimeAsync(30_000);

    expect(await within(dialogue).findByText(/Une publication est déjà en cours pour cet annonceur/)).toBeInTheDocument();
    expect(publishRadarAdvertiser).toHaveBeenCalledTimes(8);
    expect(new Set(vi.mocked(publishRadarAdvertiser).mock.calls.map((appel) => appel[2])).size).toBe(1);
    expect(vi.mocked(fetchRadarPublicationPreview).mock.calls.length).toBe(lectures);
  });

  it('sans rien à publier mais des biens déjà en ligne (réponse perdue, page rechargée) : les liens et le second message se lisent', async () => {
    await rendre(apercu({
      listings: [],
      blocking: ['radar.publish.nothing_covered'],
      published: publiee().properties,
    }));

    const section = screen.getByTestId('radar-publication-deja');
    expect(within(section).getByRole('heading', { name: 'Déjà en ligne pour cet annonceur' })).toBeInTheDocument();
    const liens = within(section).getByRole('list', { name: 'Liens publics des biens publiés' });
    expect(within(liens).getByRole('link', { name: 'Appartement 12' })).toHaveAttribute('href', 'https://takussan.test/fr/properties/appartement-12');
    expect(within(liens).getByRole('link', { name: 'Appartement 13' })).toBeInTheDocument();
    expect(await within(section).findByTestId('radar-publication-message-texte')).toHaveTextContent(/vos annonces sont en ligne/);
    expect(fetchRadarPublishedMessage).toHaveBeenCalledWith(7, 'fr');
    expect(within(section).getByRole('link', { name: 'Ouvrir WhatsApp' })).toHaveAttribute('href', WA_ME_PUBLIE);
  });

  it('sous STOP : les liens restent, le message n\'est pas demandé, une phrase fixe le dit (pas d\'erreur à réessayer)', async () => {
    await rendre(
      apercu({
        advertiser: { ...apercu().advertiser, do_not_contact_at: '2026-10-28T09:00:00+00:00' },
        listings: [],
        blocking: ['radar.advertiser.do_not_contact', 'radar.publish.nothing_covered'],
        published: publiee().properties,
      }),
      undefined,
      annonceur({ do_not_contact_at: '2026-10-28T09:00:00+00:00' }),
    );

    const section = screen.getByTestId('radar-publication-deja');
    expect(within(section).getByRole('link', { name: 'Appartement 12' })).toBeInTheDocument();
    expect(within(section).getByTestId('radar-publication-deja-stop')).toHaveTextContent('L’annonceur a demandé à ne plus être contacté : aucun message ne lui est envoyé.');
    expect(within(section).queryByTestId('radar-publication-message')).not.toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: /Réessayer/ })).not.toBeInTheDocument();
    expect(fetchRadarPublishedMessage).not.toHaveBeenCalled();
  });

  it('rien n\'est déjà en ligne : aucune section, et le message n\'est pas lu', async () => {
    await rendre();

    expect(screen.queryByTestId('radar-publication-deja')).not.toBeInTheDocument();
    expect(fetchRadarPublishedMessage).not.toHaveBeenCalled();
  });
});
