import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { fetchRadarMatches, patchRadarListing, setRadarListingAdvertiser } from '@/lib/queries/radar';
import { fiche, rendreFiche, reponseMatches } from './support';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/queries/radar', async (importOriginal) => (await import('./mocks')).mockRadarQueries(await importOriginal<object>()));
vi.mock('@/lib/queries/referentiel-public', async () => (await import('./mocks')).mockReferentiel());

Element.prototype.scrollIntoView = vi.fn();

const RETENU = '+221771234567';
const ECARTE = '+221761112233';
const ANNONCEUR = (phone: string) => ({ id: 5, phone, display_name: null, nature: 'unknown' as const, do_not_contact_at: null });

beforeEach(() => {
  vi.mocked(fetchRadarMatches).mockReset().mockResolvedValue(reponseMatches([]));
  vi.mocked(patchRadarListing).mockReset().mockResolvedValue({ data: fiche() });
  vi.mocked(setRadarListingAdvertiser).mockReset();
});

describe('les numéros de la fiche (TCK-2387, AC6)', () => {
  it('`phones` et `phones_dropped` vivent dans deux blocs distincts, le second avec son avertissement', async () => {
    await rendreFiche(fiche());

    const retenus = screen.getByRole('group', { name: 'Numéros retenus' });
    const ecartes = screen.getByRole('group', { name: 'Lus par l’IA, absents de la source' });
    expect(retenus).not.toContainElement(ecartes);
    expect(within(retenus).getByText(RETENU)).toBeInTheDocument();
    expect(within(retenus).queryByText(ECARTE)).toBeNull();
    expect(within(ecartes).getByText(ECARTE)).toBeInTheDocument();
    expect(within(ecartes).queryByText(RETENU)).toBeNull();
    expect(within(ecartes).getByText(/ne figurent pas dans le texte source/)).toBeInTheDocument();
    // Le bloc des retenus ne porte pas l'avertissement.
    expect(within(retenus).queryByText(/ne figurent pas dans le texte source/)).toBeNull();
  });

  it('l\'annonceur rattaché est un lien vers sa fiche (TCK-2388)', async () => {
    await rendreFiche(fiche({ advertiser: ANNONCEUR(RETENU), radar_advertiser_id: 5 }));
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche de l’annonceur' })).toHaveAttribute('href', '/super-admin/radar/advertisers/5');
  });

  it('une fiche sans annonceur n\'a pas de lien vers une fiche annonceur', async () => {
    await rendreFiche(fiche());
    expect(screen.queryByRole('link', { name: 'Ouvrir la fiche de l’annonceur' })).toBeNull();
  });

  it('sans numéro écarté, le bloc d\'avertissement n\'existe pas', async () => {
    const detail = fiche();
    await rendreFiche({ ...detail, extracted: { ...detail.extracted!, phones_dropped: [] } });

    expect(screen.queryByTestId('radar-phones-dropped')).toBeNull();
    expect(screen.getByTestId('radar-phones-kept')).toBeInTheDocument();
  });

  it('« En faire l\'annonceur » demande confirmation, puis envoie `PUT advertiser {phone}`', async () => {
    vi.mocked(setRadarListingAdvertiser).mockResolvedValue({ data: fiche({ advertiser: ANNONCEUR(ECARTE), radar_advertiser_id: 5 }) });
    const { user } = await rendreFiche(fiche());

    await user.click(screen.getByRole('button', { name: `En faire l’annonceur : ${ECARTE}` }));
    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent(`${ECARTE} ne figure pas dans la source`);
    expect(setRadarListingAdvertiser).not.toHaveBeenCalled();

    await user.click(within(dialogue).getByRole('button', { name: 'Rattacher' }));

    await waitFor(() => expect(setRadarListingAdvertiser).toHaveBeenCalledWith(42, ECARTE));
    expect(patchRadarListing).not.toHaveBeenCalled();
    expect(await screen.findByText('Annonceur rattaché.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('un numéro retenu se confirme avec son propre texte', async () => {
    const { user } = await rendreFiche(fiche());
    await user.click(screen.getByRole('button', { name: `En faire l’annonceur : ${RETENU}` }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(`L’annonce sera rattachée à ${RETENU}.`);
  });

  it('annuler n\'envoie rien', async () => {
    const { user } = await rendreFiche(fiche());
    await user.click(screen.getByRole('button', { name: `En faire l’annonceur : ${ECARTE}` }));
    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(setRadarListingAdvertiser).not.toHaveBeenCalled();
  });

  it('les corrections en attente partent avant le rattachement', async () => {
    vi.mocked(setRadarListingAdvertiser).mockResolvedValue({ data: fiche({ advertiser: ANNONCEUR(RETENU) }) });
    const { user } = await rendreFiche(fiche());
    await user.type(screen.getByLabelText('Prix (XOF)'), '0');
    await user.click(screen.getByRole('button', { name: `En faire l’annonceur : ${RETENU}` }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Rattacher' }));

    await waitFor(() => expect(setRadarListingAdvertiser).toHaveBeenCalledTimes(1));
    expect(patchRadarListing).toHaveBeenCalledWith(42, { price: 3500000 });
    expect(vi.mocked(patchRadarListing).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(setRadarListingAdvertiser).mock.invocationCallOrder[0],
    );
  });

  it('un STOP déjà dit pour ce numéro ferme la fiche : le message le dit et les gestes se désactivent', async () => {
    const { user, serveur } = await rendreFiche(fiche());
    // Le serveur d'essai suit le geste : la relecture qui suit l'invalidation rend l'état fermé.
    vi.mocked(setRadarListingAdvertiser).mockImplementation(async () => {
      serveur.courant = fiche({ stage: 'do_not_contact', advertiser: ANNONCEUR(ECARTE) });
      return { data: serveur.courant };
    });
    expect(screen.queryByTestId('radar-do-not-contact')).toBeNull();
    expect(screen.getByRole('button', { name: /^Écarter/ })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: `En faire l’annonceur : ${ECARTE}` }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Rattacher' }));

    expect(await screen.findByTestId('radar-do-not-contact')).toHaveTextContent('a demandé l’arrêt des contacts');
    expect(screen.queryByText('Annonceur rattaché.')).toBeNull();
    expect(screen.getByRole('button', { name: /^Valider/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Doublon/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Écarter/ })).toBeDisabled();
  });

  it('un numéro inconnu (422) s\'affiche par son libellé dans la confirmation', async () => {
    vi.mocked(setRadarListingAdvertiser).mockRejectedValue(new ApiError(422, { code: 'radar.advertiser.phone_unknown', message: 'prose' }));
    const { user } = await rendreFiche(fiche());
    await user.click(screen.getByRole('button', { name: `En faire l’annonceur : ${RETENU}` }));
    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getByRole('button', { name: 'Rattacher' }));

    expect(await within(dialogue).findByText('Aucun annonceur ne porte ce numéro.')).toBeInTheDocument();
  });

  it('hors étape de relecture, « En faire l\'annonceur » est inerte', async () => {
    await rendreFiche(fiche({ stage: 'discarded' }));

    expect(screen.getByRole('button', { name: `En faire l’annonceur : ${RETENU}` })).toBeDisabled();
  });

  it('une erreur d\'enregistrement antérieure ne s\'affiche pas dans la confirmation qui s\'ouvre', async () => {
    vi.mocked(patchRadarListing).mockRejectedValue(new ApiError(409, { code: 'radar.listing.stage_conflict', message: 'x' }));
    const { user } = await rendreFiche(fiche());
    await user.type(screen.getByLabelText('Prix (XOF)'), '0');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Cette fiche a changé d’étape entre-temps ; rechargez-la.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: `En faire l’annonceur : ${RETENU}` }));
    const dialogue = await screen.findByRole('dialog');

    expect(within(dialogue).queryByRole('alert')).toBeNull();
    expect(within(dialogue).queryByText(/changé d’étape/)).toBeNull();
  });
});

