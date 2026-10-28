import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  depositRadarReply,
  fetchRadarAdvertiser,
  prepareRadarOutreach,
  RADAR_POLL_MS,
  recordRadarOutcome,
} from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarAdvertiserDetail, RadarOutreach } from '@/types/radar';
import { RadarAdvertiserCard } from '../RadarAdvertiserCard';
import { annonceur, message, messageEnvoye, reponse, verdict } from './mocks';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  fetchRadarAdvertiser: vi.fn(),
  claimRadarAdvertiser: vi.fn(),
  releaseRadarAdvertiser: vi.fn(),
  prepareRadarOutreach: vi.fn(),
  retouchRadarOutreach: vi.fn(),
  markRadarOutreachSent: vi.fn(),
  depositRadarReply: vi.fn(),
  recordRadarOutcome: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** La fiche que l'« API » rend : un test la change pour que la relecture porte le nouvel état. */
let serveur: RadarAdvertiserDetail;

function montage(detail: RadarAdvertiserDetail) {
  serveur = detail;
  vi.mocked(fetchRadarAdvertiser).mockImplementation(async () => ({ data: serveur }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<RadarAdvertiserCard id={detail.id} />)}
    </QueryClientProvider>,
  ));
}

async function rendre(messages: RadarOutreach[]) {
  montage(annonceur({ outreaches: messages }));
  await screen.findByTestId('radar-annonceur');
  return userEvent.setup();
}

/** Ouvre le dialogue d'issue du message ouvert et le rend. */
async function ouvrirIssue(utilisateur: ReturnType<typeof userEvent.setup>) {
  await utilisateur.click(screen.getByRole('button', { name: 'Saisir l’issue' }));
  return screen.findByRole('dialog');
}

const issueRendue = (id = 5) => ({ data: message({ id, status: 'closed', outcome: 'consented' }) });

beforeEach(() => {
  vi.mocked(fetchRadarAdvertiser).mockReset();
  vi.mocked(prepareRadarOutreach).mockReset();
  vi.mocked(depositRadarReply).mockReset();
  vi.mocked(recordRadarOutcome).mockReset().mockResolvedValue(issueRendue());
});

afterEach(() => vi.useRealTimers());

const capture = (nom: string) => new File(['x'], nom, { type: 'image/png' });

describe('Déposer la réponse (TCK-2388)', () => {
  it('envoie les deux captures choisies, puis vide le choix', async () => {
    vi.mocked(depositRadarReply).mockResolvedValue({ data: reponse({ verification_status: 'pending', verdict: null }) });
    const utilisateur = await rendre([messageEnvoye()]);
    const fichiers = [capture('a.png'), capture('b.png')];

    await utilisateur.upload(screen.getByTestId('radar-reponse-fichiers'), fichiers);
    expect(screen.getByText('2 captures choisies')).toBeInTheDocument();
    await utilisateur.click(screen.getByRole('button', { name: 'Déposer la réponse' }));

    await waitFor(() => expect(depositRadarReply).toHaveBeenCalledTimes(1));
    expect(vi.mocked(depositRadarReply).mock.calls[0][0]).toBe(5);
    expect([...vi.mocked(depositRadarReply).mock.calls[0][1]]).toEqual(fichiers);
    expect(await screen.findByText('Aucune capture choisie')).toBeInTheDocument();
  });

  it('refuse sur place plus de dix captures : aucun envoi, le bouton reste fermé', async () => {
    const utilisateur = await rendre([messageEnvoye()]);
    await utilisateur.upload(screen.getByTestId('radar-reponse-fichiers'), Array.from({ length: 11 }, (_, i) => capture(`c${i}.png`)));

    expect(screen.getByTestId('radar-reponse-refus')).toHaveTextContent('Pas plus de 10 images par envoi');
    expect(screen.getByRole('button', { name: 'Déposer la réponse' })).toBeDisabled();
    expect(depositRadarReply).not.toHaveBeenCalled();
  });

  it('un dépôt refusé par l’API le dit, et garde le choix de fichiers', async () => {
    vi.mocked(depositRadarReply).mockRejectedValue(new ApiError(409, { code: 'radar.outreach.reply_pending' }));
    const utilisateur = await rendre([messageEnvoye()]);
    await utilisateur.upload(screen.getByTestId('radar-reponse-fichiers'), [capture('a.png')]);
    await utilisateur.click(screen.getByRole('button', { name: 'Déposer la réponse' }));

    expect(await screen.findByTestId('radar-annonceur-erreur')).toHaveTextContent('attend encore sa vérification');
    expect(screen.getByText('1 capture choisie')).toBeInTheDocument();
  });

  it('une réponse « en cours » se relit toutes les RADAR_POLL_MS, puis la relecture s’arrête', async () => {
    vi.useFakeTimers();
    montage(annonceur({
      outreaches: [messageEnvoye({ consents: [reponse({ verification_status: 'pending', verdict: null })] })],
    }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });

    expect(screen.getByTestId('radar-reponse-en-cours')).toHaveTextContent('Vérification en cours');
    expect(fetchRadarAdvertiser).toHaveBeenCalledTimes(1);

    // L'API a fini : la relecture suivante porte le verdict, et plus aucune ne part ensuite.
    serveur = annonceur({ outreaches: [messageEnvoye({ consents: [reponse()] })] });
    await act(async () => { await vi.advanceTimersByTimeAsync(RADAR_POLL_MS + 50); });
    expect(fetchRadarAdvertiser).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('radar-reponse-en-cours')).not.toBeInTheDocument();
    expect(screen.getByTestId('radar-verdict')).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(RADAR_POLL_MS * 3); });
    expect(fetchRadarAdvertiser).toHaveBeenCalledTimes(2);
  });

  it('une réponse en attente interdit d’en déposer une autre', async () => {
    await rendre([messageEnvoye({ consents: [reponse({ verification_status: 'pending', verdict: null })] })]);
    expect(screen.getByText(/attend encore sa vérification/)).toBeInTheDocument();
    expect(screen.getByTestId('radar-reponse-fichiers')).toBeDisabled();
  });
});

describe('Le verdict, d’un coup d’œil (TCK-2388)', () => {
  it('un accord concordant : pastille « Accord », clauses 4 sur 4, numéro concordant, réponse recopiée, vignette', async () => {
    await rendre([messageEnvoye({ consents: [reponse()] })]);
    const lecture = screen.getByTestId('radar-verdict');

    expect(within(lecture).getByText('Accord')).toBeInTheDocument();
    expect(within(lecture).getByText('Confiance : élevée')).toBeInTheDocument();
    expect(within(lecture).getByTestId('radar-verdict-clauses')).toHaveTextContent('Clauses retrouvées : 4 sur 4');
    expect(within(lecture).getByTestId('radar-verdict-numero')).toHaveTextContent('Numéro concordant');
    expect(within(lecture).getByTestId('radar-verdict-numero')).toHaveTextContent('jugé par le code');
    expect(within(lecture).getByTestId('radar-verdict-reponse')).toHaveTextContent('Oui d’accord');
    expect(within(lecture).queryByTestId('radar-verdict-ecarts')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Capture 1 de la réponse' })).toHaveAttribute('src', expect.stringContaining('capture-1.png'));
  });

  it('le verdict fait autorité sur les clauses : complet = « k sur k », même si le texte en compte un autre nombre', async () => {
    await rendre([messageEnvoye({
      message: 'Bonjour\n1. Vous acceptez.\n2. Vous pouvez dire STOP.',
      consents: [reponse({ verdict: verdict({ clauses_found: [1, 2, 3], clauses_complete: true }) })],
    })]);
    expect(screen.getByTestId('radar-verdict-clauses')).toHaveTextContent('Clauses retrouvées : 3 sur 3');
    expect(screen.getByTestId('radar-verdict-clauses')).not.toHaveTextContent('manquantes');
  });

  it('un verdict qui juge les clauses incomplètes ne se lit jamais « complet », même si le texte les montre toutes trouvées', async () => {
    await rendre([messageEnvoye({
      consents: [reponse({ verdict: verdict({ clauses_found: [1, 2, 3, 4], clauses_complete: false, discordances: ['clauses_missing'] }) })],
    })]);
    const clauses = screen.getByTestId('radar-verdict-clauses');
    expect(clauses).toHaveTextContent('le verdict les juge incomplètes');
    expect(clauses).not.toHaveTextContent('4 sur 4');
  });

  it('un numéro discordant et des clauses manquantes : les écarts sont nommés, les clauses qui manquent aussi', async () => {
    await rendre([messageEnvoye({
      consents: [reponse({
        verdict: verdict({
          number_matches: false,
          number_checked_by: 'model',
          counterpart_phone: '+221700000000',
          clauses_found: [1, 2],
          clauses_complete: false,
          discordances: ['number_mismatch', 'clauses_missing'],
        }),
      })],
    })]);

    expect(screen.getByTestId('radar-verdict-numero')).toHaveTextContent('Numéro discordant : l’en-tête affiche +221700000000');
    expect(screen.getByTestId('radar-verdict-numero')).toHaveTextContent('jugé par l’IA');
    expect(screen.getByTestId('radar-verdict-clauses')).toHaveTextContent('Clauses retrouvées : 2 sur 4');
    expect(screen.getByTestId('radar-verdict-clauses')).toHaveTextContent('manquantes : 3, 4');
    const ecarts = screen.getByTestId('radar-verdict-ecarts');
    expect(ecarts).toHaveTextContent('le numéro de l’en-tête n’est pas celui de l’annonceur');
    expect(ecarts).toHaveTextContent('une clause du message n’est pas lisible');
  });

  it('un verdict sans `discordances` ni `clauses_found` ne fait pas tomber la fiche : il se lit « pas de verdict exploitable »', async () => {
    const malforme = { ...verdict(), discordances: undefined, clauses_found: undefined } as unknown as ReturnType<typeof verdict>;

    await rendre([messageEnvoye({ consents: [reponse({ verdict: malforme })] })]);

    expect(screen.getByTestId('radar-verdict')).toBeInTheDocument();
    expect(screen.getByTestId('radar-verdict-clauses')).toHaveTextContent('Clauses retrouvées : 0');
    expect(screen.getByTestId('radar-verdict-ecarts')).toBeInTheDocument();
  });

  it('chaque classement a sa pastille, STOP comprise', async () => {
    await rendre([messageEnvoye({
      consents: [
        reponse({ id: 33, verdict: verdict({ classification: 'stop' }) }),
        reponse({ id: 32, verdict: verdict({ classification: 'ambiguous', confidence: 'low' }) }),
      ],
    })]);
    const lectures = screen.getAllByTestId('radar-verdict');
    expect(within(lectures[0]).getByText('STOP')).toBeInTheDocument();
    expect(within(lectures[1]).getByText('Ambigu')).toBeInTheDocument();
    expect(within(lectures[1]).getByText('Confiance : faible')).toBeInTheDocument();
  });

  it('la transcription est celle de la réponse, repliée ; un échec dit son motif', async () => {
    await rendre([messageEnvoye({
      consents: [reponse({
        verification_status: 'failed',
        verification_reason: 'radar.verification.timeout',
        verdict: null,
        transcript: 'Texte de la colonne',
      })],
    })]);
    expect(screen.getByTestId('radar-reponse-echec')).toHaveTextContent('La vérification a échoué : l’IA n’a pas répondu à temps');
    expect(screen.getByText('Texte de la colonne')).toBeInTheDocument();
    expect(screen.getByText('Transcription').closest('details')).not.toHaveAttribute('open');
  });

  it('un motif inconnu s’affiche brut, jamais masqué', async () => {
    await rendre([messageEnvoye({
      consents: [reponse({ verification_status: 'failed', verification_reason: 'radar.verification.nouveau', verdict: null })],
    })]);
    expect(screen.getByTestId('radar-reponse-echec')).toHaveTextContent('radar.verification.nouveau');
  });
});

describe('Confirmer ou corriger — le dialogue d’issue (TCK-2388)', () => {
  it('prérempli par le classement : un accord net se confirme tel quel, sans motif', async () => {
    const utilisateur = await rendre([messageEnvoye({ consents: [reponse()] })]);
    const dialogue = await ouvrirIssue(utilisateur);

    expect(within(dialogue).getByRole('radio', { name: /Accord/ })).toBeChecked();
    expect(within(dialogue).queryByRole('textbox')).not.toBeInTheDocument();
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));

    await waitFor(() => expect(recordRadarOutcome).toHaveBeenCalledWith(5, { outcome: 'consented' }));
  });

  it('« ambigu » ne propose rien : rien n’est coché, rien ne se confirme', async () => {
    const utilisateur = await rendre([messageEnvoye({ consents: [reponse({ verdict: verdict({ classification: 'ambiguous', discordances: ['not_consent'] }) })] })]);
    const dialogue = await ouvrirIssue(utilisateur);

    for (const radio of within(dialogue).getAllByRole('radio')) expect(radio).not.toBeChecked();
    expect(within(dialogue).getByRole('button', { name: 'Confirmer' })).toBeDisabled();
  });

  it('un verdict discordant : les écarts sont listés, « accord » sans motif est impossible, avec motif il part', async () => {
    const utilisateur = await rendre([messageEnvoye({
      consents: [reponse({ verdict: verdict({ number_matches: false, discordances: ['number_mismatch'] }) })],
    })]);
    const dialogue = await ouvrirIssue(utilisateur);

    expect(within(dialogue).getByTestId('radar-issue-ecarts')).toHaveTextContent('le numéro de l’en-tête n’est pas celui de l’annonceur');
    const confirmer = within(dialogue).getByRole('button', { name: 'Confirmer' });
    expect(confirmer).toBeDisabled();
    await utilisateur.click(confirmer);
    expect(recordRadarOutcome).not.toHaveBeenCalled();

    // Des espaces ne sont pas un motif.
    const motif = within(dialogue).getByRole('textbox', { name: 'Motif de la confirmation (obligatoire)' });
    await utilisateur.type(motif, '   ');
    expect(confirmer).toBeDisabled();

    await utilisateur.type(motif, 'Numéro du second téléphone, vérifié par appel');
    expect(confirmer).toBeEnabled();
    await utilisateur.click(confirmer);

    await waitFor(() => expect(recordRadarOutcome).toHaveBeenCalledWith(5, {
      outcome: 'consented',
      reason: 'Numéro du second téléphone, vérifié par appel',
    }));
  });

  it('un 422 « motif exigé » que l’écran n’avait pas vu liste les écarts que l’API donne', async () => {
    vi.mocked(recordRadarOutcome).mockRejectedValue(
      new ApiError(422, { code: 'radar.consent.reason_required', params: { discordances: ['number_mismatch', 'clauses_missing'] } }),
    );
    const utilisateur = await rendre([messageEnvoye({ consents: [reponse()] })]);
    const dialogue = await ouvrirIssue(utilisateur);
    expect(within(dialogue).queryByTestId('radar-issue-ecarts')).not.toBeInTheDocument();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));

    const ecarts = await within(dialogue).findByTestId('radar-issue-ecarts');
    expect(ecarts).toHaveTextContent('le numéro de l’en-tête n’est pas celui de l’annonceur');
    expect(ecarts).toHaveTextContent('une clause du message n’est pas lisible');
  });

  it('un 422 « motif exigé » sans écart dans ses paramètres retombe sur « aucun verdict »', async () => {
    vi.mocked(recordRadarOutcome).mockRejectedValue(new ApiError(422, { code: 'radar.consent.reason_required' }));
    const utilisateur = await rendre([messageEnvoye({ consents: [reponse()] })]);
    const dialogue = await ouvrirIssue(utilisateur);
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));

    expect(await within(dialogue).findByTestId('radar-issue-ecarts')).toHaveTextContent('aucun verdict');
  });

  it('le motif accepte autant de caractères que l’API (2000)', async () => {
    const utilisateur = await rendre([messageEnvoye({ consents: [reponse({ verdict: verdict({ discordances: ['not_consent'] }) })] })]);
    const dialogue = await ouvrirIssue(utilisateur);
    await utilisateur.click(within(dialogue).getByRole('radio', { name: /Accord/ }));
    expect(within(dialogue).getByRole('textbox', { name: 'Motif de la confirmation (obligatoire)' })).toHaveAttribute('maxlength', '2000');
  });

  it('sans verdict (vérification échouée), « accord » exige aussi un motif', async () => {
    const utilisateur = await rendre([messageEnvoye({
      consents: [reponse({ verification_status: 'failed', verification_reason: 'radar.verification.error', verdict: null })],
    })]);
    const dialogue = await ouvrirIssue(utilisateur);

    await utilisateur.click(within(dialogue).getByRole('radio', { name: /Accord/ }));
    expect(within(dialogue).getByTestId('radar-issue-ecarts')).toHaveTextContent('aucun verdict');
    expect(within(dialogue).getByRole('button', { name: 'Confirmer' })).toBeDisabled();
  });

  it('un 422 « motif exigé » de l’API fait paraître le motif et le focalise', async () => {
    vi.mocked(recordRadarOutcome).mockRejectedValue(new ApiError(422, { code: 'radar.consent.reason_required' }));
    const utilisateur = await rendre([messageEnvoye({ consents: [reponse()] })]);
    const dialogue = await ouvrirIssue(utilisateur);

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));

    const motif = await within(dialogue).findByRole('textbox', { name: 'Motif de la confirmation (obligatoire)' });
    await waitFor(() => expect(motif).toHaveFocus());
    expect(within(dialogue).getByTestId('radar-issue-erreur')).toHaveTextContent('écrivez le motif de la confirmation');
    expect(within(dialogue).getByRole('button', { name: 'Confirmer' })).toBeDisabled();
  });

  it('« accord » est désactivé sans réponse déposée ; « refus » et « STOP » restent possibles sans capture', async () => {
    const utilisateur = await rendre([messageEnvoye({ consents: [] })]);
    const dialogue = await ouvrirIssue(utilisateur);

    expect(within(dialogue).getByRole('radio', { name: /Accord/ })).toBeDisabled();
    expect(within(dialogue).getByText('« Accord » n’est possible qu’avec une réponse déposée.')).toBeInTheDocument();
    expect(within(dialogue).getByRole('radio', { name: /Refus/ })).toBeEnabled();
    expect(within(dialogue).getByRole('radio', { name: /STOP/ })).toBeEnabled();

    await utilisateur.click(within(dialogue).getByRole('radio', { name: /Refus/ }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(recordRadarOutcome).toHaveBeenCalledWith(5, { outcome: 'refused' }));
  });

  it('STOP demande une seconde confirmation avant de partir', async () => {
    const utilisateur = await rendre([messageEnvoye({ consents: [] })]);
    const dialogue = await ouvrirIssue(utilisateur);

    await utilisateur.click(within(dialogue).getByRole('radio', { name: /STOP/ }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));

    expect(recordRadarOutcome).not.toHaveBeenCalled();
    expect(within(dialogue).getByTestId('radar-issue-stop')).toHaveTextContent('STOP est définitif');

    // Retour : rien n'est parti, on peut changer d'avis.
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Retour' }));
    expect(recordRadarOutcome).not.toHaveBeenCalled();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Oui, c’est définitif' }));
    await waitFor(() => expect(recordRadarOutcome).toHaveBeenCalledTimes(1));
    expect(recordRadarOutcome).toHaveBeenCalledWith(5, { outcome: 'stop' });
  });

  it('un 409 « annonceur occupé » sur STOP dit seulement de réessayer, et le dialogue reste ouvert', async () => {
    vi.mocked(recordRadarOutcome).mockRejectedValue(new ApiError(409, { code: 'radar.advertiser.busy' }));
    const utilisateur = await rendre([messageEnvoye({ consents: [] })]);
    const dialogue = await ouvrirIssue(utilisateur);

    await utilisateur.click(within(dialogue).getByRole('radio', { name: /STOP/ }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Oui, c’est définitif' }));

    expect(await within(dialogue).findByTestId('radar-issue-erreur')).toHaveTextContent('réessayez dans un instant');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('Relancer ou classer sans réponse (TCK-2388)', () => {
  it('un message dû : « Préparer la relance » demande la relance de CE message, dans sa langue', async () => {
    vi.mocked(prepareRadarOutreach).mockResolvedValue({ data: { ...message({ id: 6, follow_up_of_id: 5 }), generated: true, ai_error: null } });
    const utilisateur = await rendre([
      messageEnvoye({ locale: 'en', follow_up: { due_at: '2026-01-01T00:00:00+00:00', propose_no_answer: false } }),
    ]);

    expect(screen.getByText(/Relance due depuis le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Classer sans réponse' })).not.toBeInTheDocument();
    await utilisateur.click(screen.getByRole('button', { name: 'Préparer la relance' }));

    await waitFor(() => expect(prepareRadarOutreach).toHaveBeenCalledWith(7, { follow_up_of_id: 5, locale: 'en' }));
  });

  it('préparer une relance alors qu’un brouillon existe demande confirmation : rien ne part avant', async () => {
    vi.mocked(prepareRadarOutreach).mockResolvedValue({ data: { ...message({ id: 7, follow_up_of_id: 5 }), generated: true, ai_error: null } });
    const utilisateur = await rendre([
      messageEnvoye({ follow_up: { due_at: '2026-01-01T00:00:00+00:00', propose_no_answer: false } }),
      message({ id: 6, listing_ids: [12] }),
    ]);

    await utilisateur.click(screen.getByRole('button', { name: 'Préparer la relance' }));

    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent(/le remplace/);
    expect(prepareRadarOutreach).not.toHaveBeenCalled();

    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Remplacer le brouillon' }));

    await waitFor(() => expect(prepareRadarOutreach).toHaveBeenCalledWith(7, { follow_up_of_id: 5, locale: 'fr' }));
    expect(prepareRadarOutreach).toHaveBeenCalledTimes(1);
  });

  it('quand la file propose « sans réponse », le bouton principal le fait et la relance n’est plus offerte', async () => {
    const utilisateur = await rendre([
      messageEnvoye({ follow_up_rank: 2, follow_up: { due_at: '2026-01-01T00:00:00+00:00', propose_no_answer: true } }),
    ]);

    expect(screen.queryByRole('button', { name: 'Préparer la relance' })).not.toBeInTheDocument();
    // « Classer sans réponse » devient le geste principal : plein, et « Saisir l’issue » passe au second plan.
    expect(screen.getByRole('button', { name: 'Classer sans réponse' })).toHaveClass('bg-primary');
    expect(screen.getByRole('button', { name: 'Saisir l’issue' })).not.toHaveClass('bg-primary');
    await utilisateur.click(screen.getByRole('button', { name: 'Classer sans réponse' }));

    await waitFor(() => expect(recordRadarOutcome).toHaveBeenCalledWith(5, { outcome: 'no_answer' }));
    expect(prepareRadarOutreach).not.toHaveBeenCalled();
  });

  it('une issue non finale (question, sans réponse) se lit sur la carte du message, pas seulement dans l’historique', async () => {
    await rendre([messageEnvoye({ outcome: 'question', outcome_at: '2026-10-27T09:00:00+00:00', follow_up: null })]);

    expect(screen.getByTestId('radar-suivi-issue')).toHaveTextContent(/Issue posée : Question de l’annonceur, le /);
    expect(screen.getByTestId('radar-suivi-issue')).toHaveTextContent(/peut encore la changer/);
  });

  it('un message sans issue n’affiche pas de ligne d’issue', async () => {
    await rendre([messageEnvoye()]);
    expect(screen.queryByTestId('radar-suivi-issue')).not.toBeInTheDocument();
  });

  it('avant l’échéance : la date de l’API est dite, aucune relance ne s’offre', async () => {
    await rendre([messageEnvoye({ follow_up: { due_at: '2099-01-01T00:00:00+00:00', propose_no_answer: false } })]);
    expect(screen.getByText(/Relance prévue le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Préparer la relance' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Classer sans réponse' })).not.toBeInTheDocument();
  });

  it('un message déjà relancé (relance envoyée) ne porte plus ni réponse ni issue ; seule la relance les porte', async () => {
    await rendre([
      messageEnvoye({ id: 6, follow_up_of_id: 5, sent_at: '2026-11-01T10:00:00+00:00' }),
      messageEnvoye({ id: 5, follow_up: null }),
    ]);
    expect(screen.getAllByTestId('radar-suivi-message')).toHaveLength(1);
    expect(screen.getByTestId('radar-suivi-message')).toHaveAttribute('data-outreach', '6');
  });
});
