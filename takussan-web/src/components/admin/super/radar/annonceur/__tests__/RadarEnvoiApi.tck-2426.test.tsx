import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  fetchRadarAdvertiser,
  markRadarOutreachSent,
  prepareRadarOutreach,
  RADAR_REPLY_POLL_MS,
  RADAR_REPLY_WINDOW_MS,
  recordRadarOutcome,
  sendRadarOutreach,
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
  sendRadarOutreach: vi.fn(),
  depositRadarReply: vi.fn(),
  recordRadarOutcome: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** La fiche que l'« API » rend : un test la change pour que la relecture porte le nouvel état. */
let serveur: RadarAdvertiserDetail;

function monter(detail: RadarAdvertiserDetail) {
  serveur = detail;
  vi.mocked(fetchRadarAdvertiser).mockImplementation(async () => ({ data: serveur }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<RadarAdvertiserCard id={detail.id} />)}
    </QueryClientProvider>,
  ));
}

async function rendre(detail: RadarAdvertiserDetail) {
  monter(detail);
  await screen.findByTestId('radar-annonceur');
  return userEvent.setup();
}

const BOUTON_API = 'Envoyer par l’API WhatsApp';

/** Le brouillon 5 envoyé par l'API, tel que `POST …/send` le rend. */
const envoyeParLApi = (partiel: Partial<RadarOutreach> = {}) => message({
  status: 'sent',
  sent_at: '2026-10-30T10:00:00+00:00',
  wa_me_url: null,
  follow_up: { due_at: '2026-11-06T00:00:00+00:00', propose_no_answer: false },
  channel: 'whatsapp_cloud',
  provider_status: 'accepted',
  ...partiel,
});

/** Une réponse reçue par l'API (`proof = provider_message`) : du texte, aucune capture. */
const reponseRecue = (partiel: Parameters<typeof reponse>[0] = {}) => reponse({
  proof: 'provider_message',
  captures: [],
  transcript: 'Annonceur : Oui, je suis d’accord pour les quatre points.',
  verdict: verdict({ reply_text: 'Oui, je suis d’accord pour les quatre points.' }),
  ...partiel,
});

beforeEach(() => {
  vi.mocked(fetchRadarAdvertiser).mockReset();
  vi.mocked(markRadarOutreachSent).mockReset();
  vi.mocked(sendRadarOutreach).mockReset();
  vi.mocked(prepareRadarOutreach).mockReset();
  vi.mocked(recordRadarOutcome).mockReset();
});

afterEach(() => vi.useRealTimers());

describe('Envoyer par l’API WhatsApp (TCK-2426)', () => {
  it('sans `whatsapp_api_available`, le bouton n’existe pas : seuls le lien wa.me et « J’ai envoyé » restent', async () => {
    await rendre(annonceur({ whatsapp_api_available: false, outreaches: [message()] }));

    expect(screen.queryByRole('button', { name: BOUTON_API })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ouvrir WhatsApp/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'J’ai envoyé le message' })).toBeInTheDocument();
  });

  it('AC1 — le bouton demande confirmation, envoie POST send, et la carte passe « envoyé » par l’API sans recharger la fiche', async () => {
    vi.mocked(sendRadarOutreach).mockImplementation(async () => {
      const envoye = envoyeParLApi();
      serveur = { ...serveur, outreaches: [envoye] };
      return { data: envoye };
    });
    const utilisateur = await rendre(annonceur({ whatsapp_api_available: true, outreaches: [message()] }));

    const bouton = screen.getByRole('button', { name: BOUTON_API });
    expect(bouton).toBeEnabled();
    await utilisateur.click(bouton);
    // Le message part chez un vrai annonceur : rien ne part avant l'accord de l'opérateur.
    expect(sendRadarOutreach).not.toHaveBeenCalled();
    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent(/numéro WhatsApp du Radar/);
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Oui, l’envoyer' }));

    await waitFor(() => expect(sendRadarOutreach).toHaveBeenCalledWith(5));
    expect(markRadarOutreachSent).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('radar-annonceur-apercu')).not.toBeInTheDocument());
    expect(screen.getByTestId('radar-annonceur-envoi-api')).toHaveTextContent('Message envoyé par l’API WhatsApp : Meta l’a accepté.');
    // Le message attend maintenant son issue, et sa carte dit par où il est parti.
    const suivi = screen.getByTestId('radar-suivi-message');
    expect(within(suivi).getByTestId('radar-message-canal')).toHaveTextContent('API WhatsApp');
  });

  it('la carte passe « envoyé » par la réponse de l’envoi, même avant que la relecture n’aboutisse', async () => {
    let relectureLibre: () => void = () => {};
    vi.mocked(sendRadarOutreach).mockImplementation(async () => {
      // La relecture qui suit l'envoi reste en vol : seule la réponse de `POST …/send` peut faire passer la carte.
      vi.mocked(fetchRadarAdvertiser).mockImplementation(() => new Promise((resolve) => {
        relectureLibre = () => resolve({ data: { ...serveur, outreaches: [envoyeParLApi()] } });
      }));
      return { data: envoyeParLApi() };
    });
    const utilisateur = await rendre(annonceur({ whatsapp_api_available: true, outreaches: [message()] }));

    await utilisateur.click(screen.getByRole('button', { name: BOUTON_API }));
    await utilisateur.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Oui, l’envoyer' }));

    await waitFor(() => expect(screen.queryByTestId('radar-annonceur-apercu')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('radar-suivi-message')).getByTestId('radar-message-canal')).toHaveTextContent('API WhatsApp');
    act(() => relectureLibre());
  });

  it('un envoi ambigu le dit : il a pu partir, il compte comme envoyé, et il ne se renvoie pas à la main', async () => {
    vi.mocked(sendRadarOutreach).mockImplementation(async () => {
      const envoye = envoyeParLApi({ provider_status: 'ambiguous' });
      serveur = { ...serveur, outreaches: [envoye] };
      return { data: envoye };
    });
    const utilisateur = await rendre(annonceur({ whatsapp_api_available: true, outreaches: [message()] }));

    await utilisateur.click(screen.getByRole('button', { name: BOUTON_API }));
    await utilisateur.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Oui, l’envoyer' }));

    const resultat = await screen.findByTestId('radar-annonceur-envoi-api');
    expect(resultat).toHaveTextContent(/Meta n’a pas confirmé l’envoi/);
    expect(resultat).toHaveTextContent(/Ne le renvoyez pas à la main/);
    expect(within(screen.getByTestId('radar-suivi-message')).getByTestId('radar-message-canal')).toHaveTextContent('API WhatsApp, envoi non confirmé');
  });

  it('un refus de l’API s’affiche par le libellé de son code, et le brouillon reste', async () => {
    vi.mocked(sendRadarOutreach).mockRejectedValue(new ApiError(422, { code: 'radar.whatsapp.summary_too_long', params: { max: 120 } }));
    const utilisateur = await rendre(annonceur({ whatsapp_api_available: true, outreaches: [message()] }));

    await utilisateur.click(screen.getByRole('button', { name: BOUTON_API }));
    await utilisateur.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Oui, l’envoyer' }));

    expect(await screen.findByTestId('radar-annonceur-erreur')).toHaveTextContent('Le résumé est trop long pour un envoi par l’API : raccourcissez-le.');
    expect(screen.getByTestId('radar-annonceur-apercu')).toBeInTheDocument();
    expect(screen.queryByTestId('radar-annonceur-envoi-api')).not.toBeInTheDocument();
  });

  it('une retouche non enregistrée ferme le bouton : l’API n’envoie que le texte enregistré', async () => {
    const utilisateur = await rendre(annonceur({ whatsapp_api_available: true, outreaches: [message()] }));
    await utilisateur.type(screen.getByLabelText('Résumé de l’annonce'), ' bis');
    expect(screen.getByRole('button', { name: BOUTON_API })).toBeDisabled();
  });

  it('un brouillon que l’API refuserait (`send_blocked`, sans lien wa.me) n’ouvre pas l’envoi par l’API', async () => {
    await rendre(annonceur({
      whatsapp_api_available: true,
      outreaches: [message({ wa_me_url: null, send_blocked: 'radar.outreach.follow_up_invalid' })],
    }));
    expect(screen.getByRole('button', { name: BOUTON_API })).toBeDisabled();
  });

  it('sans la prise en charge, le bouton est fermé', async () => {
    await rendre(annonceur({ whatsapp_api_available: true, claim: null, outreaches: [message()] }));
    expect(screen.getByRole('button', { name: BOUTON_API })).toBeDisabled();
  });
});

describe('Une réponse reçue non tranchée arrête tout démarchage vers l’annonceur (TCK-2426, TCK-2395 I-1, I-5)', () => {
  const PHRASE = /L’annonceur a répondu par WhatsApp, et sa réponse n’est pas tranchée/;

  /** « Stop svp » reçu par l'API sur le message 4 (annonce 12) ; le brouillon 5 est un PREMIER message, sur l'annonce 14. */
  const autreAnnonce = (partielReponse: Parameters<typeof reponse>[0] = {}, partielMessage: Partial<RadarOutreach> = {}) => [
    message({ id: 5, listing_ids: [14], follow_up_of_id: null }),
    messageEnvoye({
      id: 4,
      listing_ids: [12],
      channel: 'whatsapp_cloud',
      provider_status: 'accepted',
      consents: [reponseRecue({ id: 40, transcript: 'Annonceur : Stop svp', verdict: verdict({ classification: 'stop', reply_text: 'Stop svp' }), ...partielReponse })],
      ...partielMessage,
    }),
  ];

  it('« Stop svp » sur l’annonce A : le brouillon de l’annonce B n’offre ni lien wa.me, ni « J’ai envoyé », ni l’API, et la fiche dit pourquoi', async () => {
    await rendre(annonceur({ whatsapp_api_available: true, outreaches: autreAnnonce() }));

    expect(screen.getByTestId('radar-annonceur-reponse-en-attente')).toHaveTextContent(PHRASE);
    const apercu = screen.getByTestId('radar-annonceur-apercu');
    expect(within(apercu).queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(within(apercu).queryByText(/Le lien s’ouvre dans un nouvel onglet/)).not.toBeInTheDocument();
    expect(within(apercu).getByRole('button', { name: 'J’ai envoyé le message' })).toBeDisabled();
    expect(within(apercu).getByRole('button', { name: BOUTON_API })).toBeDisabled();
  });

  it('rien ne se prépare non plus : ni un nouveau message, ni la relance du message qui a reçu la réponse', async () => {
    const utilisateur = await rendre(annonceur({
      whatsapp_api_available: true,
      outreaches: autreAnnonce({}, { follow_up: { due_at: '2026-10-01T00:00:00+00:00', propose_no_answer: false } }),
    }));

    // Une annonce cochée : sans le blocage, « Préparer » s'ouvrirait.
    await utilisateur.click(screen.getByRole('checkbox', { name: 'Choisir l’annonce n° 13 pour le message' }));
    expect(screen.getByRole('button', { name: /^Préparer le message/ })).toBeDisabled();
    expect(within(screen.getByTestId('radar-suivi-relance')).getByRole('button', { name: 'Préparer la relance' })).toBeDisabled();
    // L'issue, elle, se pose : c'est ce qui lève le blocage.
    expect(screen.getByRole('button', { name: 'Saisir l’issue' })).toBeEnabled();
  });

  it('le brouillon d’une relance est arrêté de même par une réponse en haut de sa chaîne', async () => {
    await rendre(annonceur({
      whatsapp_api_available: true,
      outreaches: [
        message({ id: 6, follow_up_of_id: 5, follow_up_rank: 2 }),
        messageEnvoye({ id: 5, follow_up_of_id: 4, follow_up_rank: 1 }),
        messageEnvoye({ id: 4, channel: 'whatsapp_cloud', provider_status: 'accepted', consents: [reponseRecue({ id: 40 })] }),
      ],
    }));
    expect(screen.getByTestId('radar-annonceur-reponse-en-attente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'J’ai envoyé le message' })).toBeDisabled();
  });

  it('une réponse confirmée n’arrête rien', async () => {
    await rendre(annonceur({ whatsapp_api_available: true, outreaches: autreAnnonce({ confirmed_at: '2026-10-30T09:00:00+00:00' }) }));
    expect(screen.queryByTestId('radar-annonceur-reponse-en-attente')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'J’ai envoyé le message' })).toBeEnabled();
    expect(screen.getByRole('button', { name: BOUTON_API })).toBeEnabled();
  });

  it('un message qui a déjà son issue n’arrête rien, même avec une réponse reçue non confirmée (comme `whereNull(outcome)`)', async () => {
    await rendre(annonceur({ whatsapp_api_available: true, outreaches: autreAnnonce({}, { outcome: 'question' }) }));
    expect(screen.queryByTestId('radar-annonceur-reponse-en-attente')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'J’ai envoyé le message' })).toBeEnabled();
  });

  it('une capture déposée (canal manuel) n’arrête rien : seule une réponse reçue par l’API compte, comme côté API', async () => {
    await rendre(annonceur({
      outreaches: [
        message({ id: 5, listing_ids: [14] }),
        messageEnvoye({ id: 4, listing_ids: [12], consents: [reponse({ id: 40 })] }),
      ],
    }));
    expect(screen.queryByTestId('radar-annonceur-reponse-en-attente')).not.toBeInTheDocument();
  });

  it('un 409 `reply_pending` sur « J’ai envoyé » se dit à l’échelle de l’annonceur, pas dans les mots du dépôt', async () => {
    // La fiche lue ne montre pas encore la réponse (arrivée après la lecture) : seul le refus de l'API la révèle.
    vi.mocked(markRadarOutreachSent).mockRejectedValue(new ApiError(409, { code: 'radar.outreach.reply_pending' }));
    const utilisateur = await rendre(annonceur({ outreaches: [message({ id: 5, listing_ids: [14] }), messageEnvoye({ id: 4, listing_ids: [12] })] }));

    await utilisateur.click(screen.getByRole('button', { name: 'J’ai envoyé le message' }));
    await utilisateur.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Oui, je l’ai envoyé' }));

    const erreur = await screen.findByTestId('radar-annonceur-erreur');
    expect(erreur).toHaveTextContent(PHRASE);
    expect(erreur).not.toHaveTextContent(/attendez son verdict/);
  });

  it('le même 409 sur « Envoyer par l’API » se dit de même', async () => {
    vi.mocked(sendRadarOutreach).mockRejectedValue(new ApiError(409, { code: 'radar.outreach.reply_pending' }));
    const utilisateur = await rendre(annonceur({
      whatsapp_api_available: true,
      outreaches: [message({ id: 5, listing_ids: [14] }), messageEnvoye({ id: 4, listing_ids: [12] })],
    }));

    await utilisateur.click(screen.getByRole('button', { name: BOUTON_API }));
    await utilisateur.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Oui, l’envoyer' }));

    expect(await screen.findByTestId('radar-annonceur-erreur')).toHaveTextContent(PHRASE);
  });

  it('le même 409 sur une préparation (l’API la refuse désormais aussi) se dit de même', async () => {
    vi.mocked(prepareRadarOutreach).mockRejectedValue(new ApiError(409, { code: 'radar.outreach.reply_pending' }));
    const utilisateur = await rendre(annonceur({ outreaches: [] }));

    await utilisateur.click(screen.getByRole('checkbox', { name: 'Choisir l’annonce n° 12 pour le message' }));
    await utilisateur.click(screen.getByRole('button', { name: /^Préparer le message/ }));

    expect(await screen.findByTestId('radar-annonceur-erreur')).toHaveTextContent(PHRASE);
  });
});

describe('Le canal d’un message envoyé (TCK-2426)', () => {
  it('manuel, API, envoi non confirmé : sur la carte du suivi et dans l’historique', async () => {
    await rendre(annonceur({
      outreaches: [
        messageEnvoye({ id: 6, channel: 'whatsapp_cloud', provider_status: 'ambiguous' }),
        message({ id: 3, status: 'closed', outcome: 'refused', sent_at: '2026-10-21T10:00:00+00:00', channel: 'whatsapp_cloud', provider_status: 'accepted' }),
        message({ id: 2, status: 'closed', outcome: 'refused', sent_at: '2026-10-20T10:00:00+00:00' }),
      ],
    }));

    const suivi = screen.getByTestId('radar-suivi-message');
    expect(within(suivi).getByTestId('radar-message-canal')).toHaveTextContent('API WhatsApp, envoi non confirmé');
    expect(within(suivi).getByText('Meta n’a pas confirmé l’envoi : le message a pu partir.')).toBeInTheDocument();

    const lignes = within(screen.getByTestId('radar-annonceur-historique')).getAllByTestId('radar-annonceur-historique-ligne');
    expect(within(lignes[0]).getByTestId('radar-message-canal')).toHaveTextContent('API WhatsApp, envoi non confirmé');
    expect(within(lignes[1]).getByTestId('radar-message-canal')).toHaveTextContent(/^API WhatsApp$/);
    expect(within(lignes[2]).getByTestId('radar-message-canal')).toHaveTextContent('WhatsApp, à la main');
  });
});

describe('Une réponse reçue par l’API se lit en texte (TCK-2426)', () => {
  it('AC2 — le texte s’affiche sans galerie de captures, et l’issue se pose comme pour une capture', async () => {
    vi.mocked(recordRadarOutcome).mockResolvedValue({ data: messageEnvoye({ status: 'closed', outcome: 'consented', consents: [] }) });
    const utilisateur = await rendre(annonceur({ outreaches: [messageEnvoye({ channel: 'whatsapp_cloud', provider_status: 'accepted', consents: [reponseRecue()] })] }));

    const carte = screen.getByTestId('radar-reponse');
    expect(within(carte).getByText(/Reçue par l’API WhatsApp le/)).toBeInTheDocument();
    expect(within(carte).queryByText(/Déposée le/)).not.toBeInTheDocument();
    // Le texte reçu se lit d'emblée, hors d'un repli.
    const texte = within(carte).getByTestId('radar-reponse-texte');
    expect(texte).toHaveTextContent('Annonceur : Oui, je suis d’accord pour les quatre points.');
    expect(texte.closest('details')).toBeNull();
    // Un lien long sans trait d'union se coupe, dans le texte reçu comme dans sa copie du verdict (375 px).
    expect(texte).toHaveClass('break-words');
    expect(within(carte).getByTestId('radar-verdict-reponse')).toHaveClass('break-words');
    expect(within(carte).queryByText('Transcription')).not.toBeInTheDocument();
    expect(within(carte).queryByText('Captures')).not.toBeInTheDocument();
    expect(within(carte).queryByRole('img')).not.toBeInTheDocument();
    expect(carte.querySelector('svg.lucide-image')).toBeNull();

    await utilisateur.click(screen.getByRole('button', { name: 'Saisir l’issue' }));
    const dialogue = await screen.findByRole('dialog');
    // Prérempli par le classement, comme une capture : un accord net se confirme tel quel.
    expect(within(dialogue).getByRole('radio', { name: /Accord/ })).toBeChecked();
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(recordRadarOutcome).toHaveBeenCalledWith(5, { outcome: 'consented' }));
  });

  it('une réponse sans texte (vocal, image) dit qu’elle n’est pas lisible ici, sans renvoyer à des captures', async () => {
    await rendre(annonceur({
      outreaches: [messageEnvoye({
        channel: 'whatsapp_cloud',
        provider_status: 'accepted',
        consents: [reponseRecue({ verification_status: 'failed', verification_reason: 'radar.verification.no_text', verdict: null, transcript: 'Annonceur : [audio]' })],
      })],
    }));

    const echec = screen.getByTestId('radar-reponse-echec');
    expect(echec).toHaveTextContent(/Cette réponse n’a pas de texte \(message vocal, image\) : elle n’est pas lisible ici/);
    expect(echec).not.toHaveTextContent(/captures/);
    // Aucun « téléphone du Radar » : le numéro de l'API Cloud ne s'ouvre pas forcément dans un téléphone.
    expect(echec).toHaveTextContent(/dans WhatsApp, sur le numéro du Radar/);
    expect(echec).not.toHaveTextContent(/téléphone/);
    // L'issue se pose quand même : l'opérateur l'a lue dans WhatsApp, sur le numéro du Radar.
    expect(screen.getByRole('button', { name: 'Saisir l’issue' })).toBeEnabled();
  });

  it('une capture déposée garde sa date de dépôt, sa transcription repliée et ses vignettes', async () => {
    await rendre(annonceur({ outreaches: [messageEnvoye({ consents: [reponse()] })] }));
    const carte = screen.getByTestId('radar-reponse');
    expect(within(carte).getByText(/Déposée le/)).toBeInTheDocument();
    expect(within(carte).getByText('Transcription').closest('details')).not.toBeNull();
    expect(within(carte).getByRole('img')).toBeInTheDocument();
  });

  it('tant qu’un message envoyé par l’API attend son issue, la fiche se relit : la réponse arrive par le webhook', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await rendre(annonceur({ outreaches: [messageEnvoye({ channel: 'whatsapp_cloud', provider_status: 'accepted' })] }));
    const lectures = vi.mocked(fetchRadarAdvertiser).mock.calls.length;

    serveur = { ...serveur, outreaches: [messageEnvoye({ channel: 'whatsapp_cloud', provider_status: 'accepted', consents: [reponseRecue()] })] };
    await act(async () => { await vi.advanceTimersByTimeAsync(RADAR_REPLY_POLL_MS + 100); });

    await waitFor(() => expect(vi.mocked(fetchRadarAdvertiser).mock.calls.length).toBeGreaterThan(lectures));
    expect(await screen.findByTestId('radar-reponse-texte')).toHaveTextContent(/Oui, je suis d’accord/);
  });

  it('une relance envoyée à la main d’un message parti par l’API fait relire la fiche : la réponse se rattache à la relance', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await rendre(annonceur({
      outreaches: [
        messageEnvoye({ id: 6, follow_up_of_id: 5, follow_up_rank: 1 }),
        messageEnvoye({ id: 5, channel: 'whatsapp_cloud', provider_status: 'accepted', follow_up: null }),
      ],
    }));
    const lectures = vi.mocked(fetchRadarAdvertiser).mock.calls.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(RADAR_REPLY_POLL_MS + 100); });

    await waitFor(() => expect(vi.mocked(fetchRadarAdvertiser).mock.calls.length).toBeGreaterThan(lectures));
  });

  it('la relecture s’arrête au bout de la fenêtre, et reprend au retour sur l’onglet', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let visibilite: DocumentVisibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilite });
    try {
      await rendre(annonceur({ outreaches: [messageEnvoye({ channel: 'whatsapp_cloud', provider_status: 'accepted' })] }));

      await act(async () => { await vi.advanceTimersByTimeAsync(RADAR_REPLY_WINDOW_MS + RADAR_REPLY_POLL_MS); });
      const auBoutDeLaFenetre = vi.mocked(fetchRadarAdvertiser).mock.calls.length;
      expect(auBoutDeLaFenetre).toBeGreaterThan(RADAR_REPLY_WINDOW_MS / RADAR_REPLY_POLL_MS - 2);
      await act(async () => { await vi.advanceTimersByTimeAsync(RADAR_REPLY_POLL_MS * 4); });
      expect(vi.mocked(fetchRadarAdvertiser).mock.calls.length).toBe(auBoutDeLaFenetre);

      // L'onglet se cache, puis revient : la fenêtre se rouvre, la fiche se relit et reprend son rythme.
      visibilite = 'hidden';
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      visibilite = 'visible';
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      await act(async () => { await vi.advanceTimersByTimeAsync(RADAR_REPLY_POLL_MS * 2 + 100); });
      expect(vi.mocked(fetchRadarAdvertiser).mock.calls.length).toBeGreaterThanOrEqual(auBoutDeLaFenetre + 3);
    } finally {
      // La propriété propre masquait celle de `Document.prototype` : la retirer rend celle de jsdom.
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  it('un message envoyé à la main, sans envoi par l’API dans sa chaîne, ne fait pas relire la fiche', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await rendre(annonceur({ outreaches: [messageEnvoye()] }));
    const lectures = vi.mocked(fetchRadarAdvertiser).mock.calls.length;

    await act(async () => { await vi.advanceTimersByTimeAsync(RADAR_REPLY_POLL_MS * 2); });

    expect(vi.mocked(fetchRadarAdvertiser).mock.calls.length).toBe(lectures);
  });
});
