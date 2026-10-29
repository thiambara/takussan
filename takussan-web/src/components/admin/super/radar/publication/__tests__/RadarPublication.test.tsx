import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  deleteRadarListingPhoto,
  fetchRadarPublicationPreview,
  fetchRadarPublishedMessage,
  publishRadarAdvertiser,
  refetchRadarListingPhotos,
  uploadRadarListingPhotos,
} from '@/lib/queries/radar';
import { PLATFORM_ABILITIES } from '@/lib/platform-abilities';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarPublicationPreview } from '@/types/radar';
import { RadarPublication } from '../RadarPublication';
import { annonce, apercu, messagePublie, publiee, WA_ME_PUBLIE } from './mocks';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  fetchRadarPublicationPreview: vi.fn(),
  publishRadarAdvertiser: vi.fn(),
  fetchRadarPublishedMessage: vi.fn(),
  refetchRadarListingPhotos: vi.fn(),
  uploadRadarListingPhotos: vi.fn(),
  deleteRadarListingPhoto: vi.fn(),
}));

/** L'aperçu que l'« API » rend : un test le change pour que la relecture porte le nouvel état. */
let serveur: RadarPublicationPreview;

async function rendre(detail: RadarPublicationPreview = apercu(), gestes?: Parameters<typeof avecGestes>[1]) {
  serveur = detail;
  vi.mocked(fetchRadarPublicationPreview).mockImplementation(async () => ({ data: serveur }));
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

  it('une annonce bloquée n\'est pas cochée, ne se coche pas, et dit pourquoi', async () => {
    const { utilisateur } = await rendre(apercu({
      listings: [annonce(12), annonce(13, { photos: [], blocking: ['radar.publish.no_photo', 'radar.publish.missing_field'] })],
    }));

    const carte = screen.getByTestId('radar-publication-carte-13');
    const case13 = within(carte).getByRole('checkbox', { name: 'Publier l’annonce n° 13' });
    expect(case13).not.toBeChecked();
    expect(case13).toBeDisabled();
    const blocages = within(carte).getByTestId('radar-publication-blocages-13');
    expect(within(blocages).getByText(/n’a aucune photo dans sa réserve/)).toBeInTheDocument();
    expect(within(blocages).getByText(/est incomplète/)).toBeInTheDocument();
    await utilisateur.click(case13);
    expect(case13).not.toBeChecked();
    expect(publier()).toHaveTextContent('Publier 1 annonce');
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
    expect(alerte).toHaveAttribute('role', 'alert');
    expect(within(alerte).getByText('Ressemble déjà à : le bien n° 88, l’annonce n° 15.')).toBeInTheDocument();
    expect(within(alerte).getByText('Marquée comme doublon du bien n° 88.')).toBeInTheDocument();
  });

  it('sans le geste « publier », l\'écran ne s\'ouvre pas et rien n\'est lu', async () => {
    await rendre(apercu(), { level: 'support', abilities: PLATFORM_ABILITIES.filter((g) => g !== 'platform.radar.publish') });

    expect(await screen.findByText('Publier pour un annonceur est réservé aux super-administrateurs.')).toBeInTheDocument();
    expect(fetchRadarPublicationPreview).not.toHaveBeenCalled();
  });

  it('un aperçu illisible se dit, et se relit', async () => {
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

  it('sans photo à lire à la source, la relance n\'est pas offerte ; pendant la préparation, elle est fermée', async () => {
    await rendre(apercu({
      listings: [
        annonce(12, { photo_preparation: { status: 'none', total: 0, done: 0 } }),
        annonce(13, { photos: [], photo_preparation: { status: 'pending', total: 3, done: 1 }, blocking: ['radar.publish.photos_pending'] }),
      ],
    }));

    expect(within(screen.getByTestId('radar-publication-carte-12')).queryByRole('button', { name: 'Récupérer les photos de la source' })).not.toBeInTheDocument();
    const carte = screen.getByTestId('radar-publication-carte-13');
    expect(within(carte).getByRole('button', { name: 'Récupérer les photos de la source' })).toBeDisabled();
    expect(within(carte).getByTestId('radar-publication-preparation-13')).toHaveTextContent('Lecture des photos de la source : 1 sur 3.');
  });

  it('une réserve pleine ferme le dépôt', async () => {
    const photos = Array.from({ length: 20 }, (_, i) => ({ id: 900 + i, url: `https://media.takussan.test/${i}.jpg` }));
    await rendre(apercu({ listings: [annonce(12, { photos })] }));

    expect(within(screen.getByTestId('radar-publication-carte-12')).getByRole('button', { name: 'Déposer des photos' })).toBeDisabled();
    expect(screen.getByText('La réserve est pleine : 20 photos au plus.')).toBeInTheDocument();
  });

  it('un refus de la réserve se dit par son code, et l\'aperçu se relit sur un 422', async () => {
    vi.mocked(deleteRadarListingPhoto).mockRejectedValue(new ApiError(409, { code: 'radar.advertiser.claim_required' }));
    const { utilisateur } = await rendre();
    const lectures = vi.mocked(fetchRadarPublicationPreview).mock.calls.length;

    await utilisateur.click(screen.getByRole('button', { name: 'Retirer la photo 1 de l’annonce n° 12' }));

    expect(await screen.findByText(/Prenez d’abord cet annonceur en charge/)).toBeInTheDocument();
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
