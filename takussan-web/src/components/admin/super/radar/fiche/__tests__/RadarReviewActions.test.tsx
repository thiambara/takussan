import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  discardRadarListing,
  fetchNextRadarListingId,
  fetchRadarMatches,
  markRadarListingDuplicate,
  patchRadarListing,
  reviewRadarListing,
} from '@/lib/queries/radar';
import { ANNONCE, BIEN_PRIVE, BIEN_PUBLIC, fiche, rendreFiche, reponseMatches } from './support';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/queries/radar', async (importOriginal) => (await import('./mocks')).mockRadarQueries(await importOriginal<object>()));
vi.mock('@/lib/queries/referentiel-public', async () => (await import('./mocks')).mockReferentiel());

Element.prototype.scrollIntoView = vi.fn();

const TITRE_DOUBLON = 'Marquer comme doublon';

beforeEach(() => {
  vi.mocked(Element.prototype.scrollIntoView).mockClear();
  push.mockReset();
  vi.mocked(fetchRadarMatches).mockReset().mockResolvedValue(reponseMatches([]));
  vi.mocked(patchRadarListing).mockReset().mockResolvedValue({ data: fiche() });
  vi.mocked(reviewRadarListing).mockReset().mockResolvedValue({ data: fiche({ stage: 'reviewed' }) });
  vi.mocked(markRadarListingDuplicate).mockReset().mockResolvedValue({ data: fiche({ stage: 'duplicate' }) });
  vi.mocked(discardRadarListing).mockReset().mockResolvedValue({ data: fiche({ stage: 'discarded' }) });
  vi.mocked(fetchNextRadarListingId).mockReset().mockResolvedValue(99);
});

const CTRL_ENTREE = '{Control>}{Enter}{/Control}';

describe('les trois gestes de la fiche (TCK-2387)', () => {
  describe('valider', () => {
    it('Ctrl+Entrée depuis un champ envoie la correction en attente PUIS la validation, et ouvre la fiche suivante', async () => {
      const { user } = await rendreFiche(fiche());
      const prix = screen.getByLabelText('Prix (XOF)');
      await user.type(prix, '0');
      await user.keyboard(CTRL_ENTREE);

      await waitFor(() => expect(push).toHaveBeenCalledWith('/super-admin/radar/99'));
      expect(patchRadarListing).toHaveBeenCalledWith(42, { price: 3500000 });
      expect(reviewRadarListing).toHaveBeenCalledWith(42);
      expect(vi.mocked(patchRadarListing).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(reviewRadarListing).mock.invocationCallOrder[0],
      );
      expect(fetchNextRadarListingId).toHaveBeenCalledWith(42);
    });

    it('sans correction, aucun PATCH ne part ; sans fiche suivante, retour à la liste', async () => {
      vi.mocked(fetchNextRadarListingId).mockResolvedValue(null);
      const { user } = await rendreFiche(fiche());
      await user.keyboard(CTRL_ENTREE);

      await waitFor(() => expect(push).toHaveBeenCalledWith('/super-admin/radar'));
      expect(patchRadarListing).not.toHaveBeenCalled();
      expect(reviewRadarListing).toHaveBeenCalledTimes(1);
    });

    it('un PATCH refusé arrête le geste : la validation ne part pas, la correction reste', async () => {
      vi.mocked(patchRadarListing).mockRejectedValue(new ApiError(409, { code: 'radar.listing.stage_conflict', message: 'x' }));
      const { user } = await rendreFiche(fiche());
      await user.type(screen.getByLabelText('Prix (XOF)'), '0');
      await user.keyboard(CTRL_ENTREE);

      expect(await screen.findByText('Cette fiche a changé d’étape entre-temps ; rechargez-la.')).toBeInTheDocument();
      expect(reviewRadarListing).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Prix (XOF)')).toHaveValue(3500000);
    });

    it('le 422 « incomplet » nomme les champs manquants et met le focus sur le premier', async () => {
      vi.mocked(reviewRadarListing).mockRejectedValue(
        new ApiError(422, { code: 'radar.review.incomplete', message: 'prose', params: { fields: ['neighborhood_id'] } }),
      );
      const { user } = await rendreFiche(fiche());
      await user.click(screen.getByRole('button', { name: /^Valider/ }));

      expect(await screen.findByText('Champs à compléter : Quartier.')).toBeInTheDocument();
      const zone = document.querySelector('[data-champ="neighborhood"]');
      expect(zone).not.toBeNull();
      await waitFor(() => expect(zone).toContainElement(document.activeElement as HTMLElement));
      expect(push).not.toHaveBeenCalled();
    });
  });

  describe('raccourcis D et E', () => {
    it('D et E ne partent pas depuis un champ, une zone de texte ou une liste déroulante', async () => {
      const { user } = await rendreFiche(fiche());

      await user.click(screen.getByLabelText('Titre'));
      await user.keyboard('de');
      expect(screen.getByLabelText('Titre')).toHaveValue('Appartement F3de');

      await user.click(screen.getByLabelText('Description'));
      await user.keyboard('de');
      expect(screen.getByLabelText('Description')).toHaveValue('de');

      screen.getByLabelText('Ville du référentiel').focus();
      await user.keyboard('d');
      await user.keyboard('e');

      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('D sur la page ouvre le dialogue de doublon, E celui de l\'écart', async () => {
      const { user } = await rendreFiche(fiche());

      await user.keyboard('d');
      const doublon = await screen.findByRole('dialog');
      expect(within(doublon).getByRole('heading', { name: TITRE_DOUBLON })).toBeInTheDocument();
      await user.click(within(doublon).getByRole('button', { name: 'Annuler' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      await user.keyboard('e');
      const ecart = await screen.findByRole('dialog');
      expect(within(ecart).getByRole('heading', { name: 'Écarter l’annonce' })).toBeInTheDocument();
    });

    it('un dialogue ouvert garde les raccourcis : ni D, ni E, ni Ctrl+Entrée ne touchent la fiche derrière', async () => {
      const { user } = await rendreFiche(fiche());
      await user.keyboard('e');
      const ecart = await screen.findByRole('dialog');

      await user.keyboard('d');
      await user.keyboard(CTRL_ENTREE);

      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(within(ecart).getByRole('heading', { name: 'Écarter l’annonce' })).toBeInTheDocument();
      expect(reviewRadarListing).not.toHaveBeenCalled();
    });

    it('un dialogue modal garde les raccourcis même quand le focus n\'y est pas (encore) : la touche part du corps de la page', async () => {
      const { user } = await rendreFiche(fiche());
      await user.keyboard('e');
      await screen.findByRole('dialog');
      (document.activeElement as HTMLElement).blur();
      expect(document.activeElement).toBe(document.body);

      await user.keyboard('d');
      expect(screen.queryByRole('heading', { name: TITRE_DOUBLON })).toBeNull();
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });

    it('les boutons portent leur raccourci, affiché et déclaré', async () => {
      await rendreFiche(fiche());

      expect(screen.getByRole('button', { name: /^Valider/ })).toHaveAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');
      expect(screen.getByRole('button', { name: /^Doublon/ })).toHaveAttribute('aria-keyshortcuts', 'D');
      expect(screen.getByRole('button', { name: /^Écarter/ })).toHaveAttribute('aria-keyshortcuts', 'E');
      expect(within(screen.getByTestId('radar-gestes')).getAllByText(/^(D|E|⌘\/Ctrl \+ Entrée)$/)).toHaveLength(3);
    });
  });

  describe('doublon', () => {
    it('saisie manuelle : une annonce envoie `{of_listing_id}`, un bien `{of_property_id}`, jamais les deux', async () => {
      const { user } = await rendreFiche(fiche());
      await user.keyboard('d');
      const dialogue = await screen.findByRole('dialog');

      await user.click(within(dialogue).getByRole('radio', { name: 'Une autre annonce ou un autre bien' }));
      await user.type(within(dialogue).getByLabelText('Identifiant'), '17');
      await user.click(within(dialogue).getByRole('button', { name: TITRE_DOUBLON }));

      await waitFor(() => expect(push).toHaveBeenCalledWith('/super-admin/radar/99'));
      expect(markRadarListingDuplicate).toHaveBeenCalledWith(42, { of_listing_id: 17 });
    });

    it('saisie manuelle d\'un bien du catalogue', async () => {
      const { user } = await rendreFiche(fiche());
      await user.keyboard('d');
      const dialogue = await screen.findByRole('dialog');

      await user.click(within(dialogue).getByRole('radio', { name: 'Une autre annonce ou un autre bien' }));
      await user.click(within(dialogue).getByRole('radio', { name: 'Bien du catalogue' }));
      await user.type(within(dialogue).getByLabelText('Identifiant'), '7');
      await user.click(within(dialogue).getByRole('button', { name: TITRE_DOUBLON }));

      await waitFor(() => expect(markRadarListingDuplicate).toHaveBeenCalledTimes(1));
      expect(markRadarListingDuplicate).toHaveBeenCalledWith(42, { of_property_id: 7 });
    });

    it('depuis un rapprochement : la cible vient du rapprochement, une seule clé part', async () => {
      vi.mocked(fetchRadarMatches).mockResolvedValue(reponseMatches([BIEN_PUBLIC, ANNONCE]));
      const { user } = await rendreFiche(fiche());
      const carte = await screen.findByTestId('radar-match-property-7');
      await user.click(within(carte).getByRole('button', { name: 'Doublon de celui-ci' }));
      const dialogue = await screen.findByRole('dialog');
      await user.click(within(dialogue).getByRole('button', { name: TITRE_DOUBLON }));

      await waitFor(() => expect(markRadarListingDuplicate).toHaveBeenCalledTimes(1));
      expect(markRadarListingDuplicate).toHaveBeenCalledWith(42, { of_property_id: 7 });
      expect(Object.keys(vi.mocked(markRadarListingDuplicate).mock.calls[0][1])).toHaveLength(1);
    });

    it('une chaîne de doublons (422) s\'affiche par son libellé dans le dialogue, sans navigation', async () => {
      vi.mocked(markRadarListingDuplicate).mockRejectedValue(
        new ApiError(422, { code: 'radar.duplicate.chain', message: 'prose' }),
      );
      const { user } = await rendreFiche(fiche());
      await user.keyboard('d');
      const dialogue = await screen.findByRole('dialog');
      await user.click(within(dialogue).getByRole('radio', { name: 'Une autre annonce ou un autre bien' }));
      await user.type(within(dialogue).getByLabelText('Identifiant'), '17');
      await user.click(within(dialogue).getByRole('button', { name: TITRE_DOUBLON }));

      expect(await within(dialogue).findByText(/déjà un doublon, ou pointe déjà vers celle-ci/)).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
    });
  });

  describe('écarter', () => {
    it('envoie `{reason}` du motif choisi, après les corrections en attente', async () => {
      const { user } = await rendreFiche(fiche());
      await user.type(screen.getByLabelText('Prix (XOF)'), '0');
      await user.keyboard('{Escape}');
      screen.getByLabelText('Prix (XOF)').blur();
      await user.keyboard('e');
      const dialogue = await screen.findByRole('dialog');

      const confirmer = within(dialogue).getByRole('button', { name: 'Écarter' });
      expect(confirmer).toBeDisabled();
      const motif = within(dialogue).getAllByRole('radio')[0];
      await user.click(motif);
      await user.click(confirmer);

      await waitFor(() => expect(push).toHaveBeenCalledWith('/super-admin/radar/99'));
      expect(patchRadarListing).toHaveBeenCalledTimes(1);
      expect(discardRadarListing).toHaveBeenCalledTimes(1);
      const [id, reason] = vi.mocked(discardRadarListing).mock.calls[0];
      expect(id).toBe(42);
      expect(typeof reason).toBe('string');
      expect(vi.mocked(patchRadarListing).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(discardRadarListing).mock.invocationCallOrder[0],
      );
    });
  });

  describe('selon l\'étape', () => {
    it('une fiche déjà validée ne se valide plus, mais se ferme encore', async () => {
      const { user } = await rendreFiche(fiche({ stage: 'reviewed' }));

      expect(screen.getByRole('button', { name: /^Valider/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /^Doublon/ })).toBeEnabled();
      await user.keyboard(CTRL_ENTREE);
      expect(reviewRadarListing).not.toHaveBeenCalled();
      await user.keyboard('d');
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });

    it('`do_not_contact` : aucun geste, ni bouton ni raccourci', async () => {
      const { user } = await rendreFiche(fiche({ stage: 'do_not_contact' }));

      expect(screen.getByRole('button', { name: /^Valider/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /^Doublon/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /^Écarter/ })).toBeDisabled();
      await user.keyboard('d');
      await user.keyboard('e');
      await user.keyboard(CTRL_ENTREE);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(reviewRadarListing).not.toHaveBeenCalled();
    });
  });
});

describe('revue de la Task 8 (TCK-2387)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll('[data-test-chat]').forEach((n) => n.remove());
  });

  describe('valider relit les rapprochements', () => {
    it('une correction qui fait apparaître un rapprochement fort arrête la validation : l\'alerte s\'affiche, le geste suivant valide', async () => {
      vi.mocked(fetchRadarMatches).mockReset()
        .mockResolvedValueOnce(reponseMatches([]))
        .mockResolvedValue(reponseMatches([BIEN_PRIVE]));
      const { user } = await rendreFiche(fiche());
      await user.type(screen.getByLabelText('Prix (XOF)'), '0');
      await user.keyboard(CTRL_ENTREE);

      expect(await screen.findByTestId('radar-geste-avertissement')).toHaveTextContent('De nouveaux rapprochements sont apparus');
      expect(patchRadarListing).toHaveBeenCalledTimes(1);
      expect(reviewRadarListing).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
      expect(await screen.findByTestId('radar-match-property-8')).toBeInTheDocument();
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

      await user.keyboard(CTRL_ENTREE);
      await waitFor(() => expect(push).toHaveBeenCalledWith('/super-admin/radar/99'));
      expect(reviewRadarListing).toHaveBeenCalledTimes(1);
    });

    it('un rapprochement que l\'opérateur avait déjà sous les yeux ne retient pas la validation', async () => {
      vi.mocked(fetchRadarMatches).mockReset().mockResolvedValue(reponseMatches([BIEN_PRIVE]));
      const { user } = await rendreFiche(fiche());
      await screen.findByTestId('radar-match-property-8');
      await user.keyboard(CTRL_ENTREE);

      await waitFor(() => expect(reviewRadarListing).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('radar-geste-avertissement')).toBeNull();
    });

    it('un rapprochement faible qui apparaît ne retient rien', async () => {
      vi.mocked(fetchRadarMatches).mockReset()
        .mockResolvedValueOnce(reponseMatches([]))
        .mockResolvedValue(reponseMatches([ANNONCE]));
      const { user } = await rendreFiche(fiche());
      await user.type(screen.getByLabelText('Prix (XOF)'), '0');
      await user.keyboard(CTRL_ENTREE);

      await waitFor(() => expect(reviewRadarListing).toHaveBeenCalledTimes(1));
    });

    it('rapprochements illisibles au moment de valider : la validation part (le panneau le dit déjà)', async () => {
      vi.mocked(fetchRadarMatches).mockReset()
        .mockResolvedValueOnce(reponseMatches([]))
        .mockRejectedValue(new Error('panne'));
      const { user } = await rendreFiche(fiche());
      await user.type(screen.getByLabelText('Prix (XOF)'), '0');
      await user.keyboard(CTRL_ENTREE);

      await waitFor(() => expect(reviewRadarListing).toHaveBeenCalledTimes(1));
    });
  });

  describe('dialogue non modal', () => {
    const poserUnWidget = () => {
      const widget = document.createElement('div');
      widget.setAttribute('role', 'dialog');
      widget.setAttribute('aria-label', 'discussion');
      widget.setAttribute('tabindex', '0');
      widget.setAttribute('data-test-chat', '');
      document.body.appendChild(widget);
      return widget;
    };

    it('un `role="dialog"` non modal posé sur la page ne coupe pas les raccourcis', async () => {
      poserUnWidget();
      const { user } = await rendreFiche(fiche());

      await user.keyboard('d');
      expect(await screen.findByRole('heading', { name: TITRE_DOUBLON })).toBeInTheDocument();
    });

    it('mais une touche partie de l\'intérieur d\'un dialogue lui appartient', async () => {
      const widget = poserUnWidget();
      const { user } = await rendreFiche(fiche());

      widget.focus();
      await user.keyboard('d');
      await user.keyboard('e');
      expect(screen.queryByRole('heading', { name: TITRE_DOUBLON })).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Écarter l’annonce' })).toBeNull();
    });
  });

  describe('un seul envoi', () => {
    it('deux ⌘/Ctrl+Entrée coup sur coup n\'envoient qu\'une validation', async () => {
      let liberer: (valeur: { data: ReturnType<typeof fiche> }) => void = () => undefined;
      vi.mocked(reviewRadarListing).mockReset().mockReturnValue(new Promise((resolve) => { liberer = resolve; }));
      const { user } = await rendreFiche(fiche());

      // Dans le même tick : aucun rendu ne sépare les deux, seul un drapeau hors état les distingue.
      fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
      fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
      await waitFor(() => expect(reviewRadarListing).toHaveBeenCalledTimes(1));
      await user.keyboard(CTRL_ENTREE);
      expect(reviewRadarListing).toHaveBeenCalledTimes(1);

      liberer({ data: fiche({ stage: 'reviewed' }) });
      await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    });

    it('une touche maintenue (keydown répété) n\'envoie rien de plus', async () => {
      await rendreFiche(fiche());

      fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true, repeat: true });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(reviewRadarListing).not.toHaveBeenCalled();

      fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
      await waitFor(() => expect(reviewRadarListing).toHaveBeenCalledTimes(1));
    });
  });

  it('l\'échec de l\'enregistrement d\'une correction s\'affiche DANS le dialogue du geste', async () => {
    vi.mocked(patchRadarListing).mockRejectedValue(new ApiError(409, { code: 'radar.listing.stage_conflict', message: 'x' }));
    const { user } = await rendreFiche(fiche());
    await user.type(screen.getByLabelText('Prix (XOF)'), '0');
    screen.getByLabelText('Prix (XOF)').blur();
    await user.keyboard('e');
    const dialogue = await screen.findByRole('dialog');
    await user.click(within(dialogue).getAllByRole('radio')[0]);
    await user.click(within(dialogue).getByRole('button', { name: 'Écarter' }));

    expect(await within(dialogue).findByText('Cette fiche a changé d’étape entre-temps ; rechargez-la.')).toBeInTheDocument();
    expect(discardRadarListing).not.toHaveBeenCalled();
  });

  it('un 422 « incomplet » : le focus gagne le champ, la source montre son passage, et seule la source défile', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(400);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(20);
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(100);
    vi.mocked(reviewRadarListing).mockRejectedValue(
      new ApiError(422, { code: 'radar.review.incomplete', message: 'prose', params: { fields: ['neighborhood_id'] } }),
    );
    const { user } = await rendreFiche(fiche());
    await user.click(screen.getByRole('button', { name: /^Valider/ }));

    const zone = document.querySelector('[data-champ="neighborhood"]');
    await waitFor(() => expect(zone).toContainElement(document.activeElement as HTMLElement));
    // Le focus a déclenché `onFocus` : le passage cité est entouré dans la source, qui seule défile.
    await waitFor(() => expect(document.querySelector('mark')?.textContent).toBe('aux Almadies'));
    expect(screen.getByTestId('radar-source-text').scrollTop).toBe(320);
    expect(scrollTo).not.toHaveBeenCalled();
    // Le seul `scrollIntoView` est celui du champ ramené à l'écran : jamais la source, jamais le passage.
    const cibles = vi.mocked(Element.prototype.scrollIntoView).mock.contexts as Element[];
    expect(cibles.length).toBeGreaterThan(0);
    for (const cible of cibles) expect(zone).toContainElement(cible as HTMLElement);
  });
});

