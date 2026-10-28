import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  claimRadarAdvertiser,
  fetchRadarAdvertiser,
  markRadarOutreachSent,
  prepareRadarOutreach,
  releaseRadarAdvertiser,
  retouchRadarOutreach,
} from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarAdvertiserDetail } from '@/types/radar';
import { RadarAdvertiserCard } from '../RadarAdvertiserCard';
import { annonce, annonceur, message, MESSAGE_PREPARE, prise, SEGMENTS, WA_ME } from './mocks';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  fetchRadarAdvertiser: vi.fn(),
  claimRadarAdvertiser: vi.fn(),
  releaseRadarAdvertiser: vi.fn(),
  prepareRadarOutreach: vi.fn(),
  retouchRadarOutreach: vi.fn(),
  markRadarOutreachSent: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** La fiche que l'« API » rend : un test la change pour que la relecture porte le nouvel état. */
let serveur: RadarAdvertiserDetail;

/** Monte la fiche sans attendre : les tests à minuteurs simulés n'ont pas de `findBy` (`waitFor` ne les avance pas). */
function monter(detail: RadarAdvertiserDetail) {
  serveur = detail;
  vi.mocked(fetchRadarAdvertiser).mockImplementation(async () => ({ data: serveur }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<RadarAdvertiserCard id={detail.id} />)}
    </QueryClientProvider>,
  ));
  return queryClient;
}

async function rendre(detail: RadarAdvertiserDetail = annonceur()) {
  const queryClient = monter(detail);
  await screen.findByTestId('radar-annonceur');
  return { queryClient, utilisateur: userEvent.setup() };
}

const erreur409 = (code: string, params: Record<string, unknown> = {}) => new ApiError(409, { code, params });

beforeEach(() => {
  vi.mocked(fetchRadarAdvertiser).mockReset();
  vi.mocked(claimRadarAdvertiser).mockReset();
  vi.mocked(releaseRadarAdvertiser).mockReset();
  vi.mocked(prepareRadarOutreach).mockReset();
  vi.mocked(retouchRadarOutreach).mockReset();
  vi.mocked(markRadarOutreachSent).mockReset();
});

describe('RadarAdvertiserCard — ce que la fiche rend (TCK-2388)', () => {
  it('rend l\'identité, la nature et ses indices avec leur passage, les annonces et l\'historique', async () => {
    await rendre(annonceur({
      outreaches: [
        message({
          id: 9,
          status: 'closed',
          outcome: 'refused',
          sent_at: '2026-10-27T12:00:00+00:00',
          created_by: { id: 2, name: 'Fatou Sow' },
          locale: 'en',
          clauses_version: '2026-10-28',
          listing_ids: [12],
        }),
      ],
    }));

    const identite = screen.getByTestId('radar-annonceur-identite');
    expect(within(identite).getByText('Moussa Immo')).toBeInTheDocument();
    expect(within(identite).getByText('+221771234567')).toBeInTheDocument();
    expect(within(identite).getByText('Intermédiaire probable')).toBeInTheDocument();
    expect(within(identite).getByText('Plusieurs biens en location')).toBeInTheDocument();
    expect(within(identite).getByText('Nos biens disponibles')).toBeInTheDocument();

    const annonces = screen.getByTestId('radar-annonceur-annonces');
    expect(within(annonces).getByText('Appartement 12')).toBeInTheDocument();
    expect(within(annonces).getByText('Villa 14')).toBeInTheDocument();
    expect(within(annonces).getAllByText(/Almadies/).length).toBeGreaterThan(0);
    expect(within(annonces).getByRole('link', { name: /annonce n° 12/ })).toHaveAttribute('href', '/super-admin/radar/12');

    const ligne = within(screen.getByTestId('radar-annonceur-historique')).getByTestId('radar-annonceur-historique-ligne');
    expect(within(ligne).getByText('Clos')).toBeInTheDocument();
    expect(within(ligne).getByText('Refus')).toBeInTheDocument();
    expect(within(ligne).getByText('Fatou Sow')).toBeInTheDocument();
    expect(within(ligne).getByText('en')).toBeInTheDocument();
    expect(within(ligne).getByText('2026-10-28')).toBeInTheDocument();
    expect(within(ligne).getByRole('link', { name: 'n° 12' })).toHaveAttribute('href', '/super-admin/radar/12');
    // Le texte exact se replie, mais il est là, tel qu'enregistré.
    expect(within(ligne).getByText(MESSAGE_PREPARE, { normalizer: (t) => t })).toBeInTheDocument();
  });

  it('les messages envoyés vont du plus récent au plus ancien, comme l\'API les rend ; un message préparé n\'y est pas', async () => {
    await rendre(annonceur({
      outreaches: [
        message({ id: 3, status: 'prepared' }),
        message({ id: 2, status: 'sent', sent_at: '2026-10-27T12:00:00+00:00', locale: 'fr' }),
        message({ id: 1, status: 'closed', outcome: 'stop', sent_at: '2026-10-20T12:00:00+00:00' }),
      ],
    }));

    const lignes = within(screen.getByTestId('radar-annonceur-historique')).getAllByTestId('radar-annonceur-historique-ligne');
    expect(lignes).toHaveLength(2);
    expect(within(lignes[0]).getByText('Envoyé')).toBeInTheDocument();
    expect(within(lignes[1]).getByText('Ne plus contacter')).toBeInTheDocument();
    expect(screen.getByTestId('radar-annonceur-apercu')).toBeInTheDocument();
  });

  it('une annonce qui ne se coche pas dit pourquoi : couverte, pas relue, close, en attente d\'une réponse', async () => {
    await rendre(annonceur({
      listings: [
        annonce(1),
        annonce(2, { stage: 'consented', covered_by_consent: true }),
        annonce(3, { stage: 'extracted' }),
        annonce(4, { stage: 'discarded' }),
        annonce(5, { stage: 'contacted' }),
        annonce(6, { stage: 'contacted' }),
      ],
      outreaches: [message({ id: 8, status: 'sent', listing_ids: [5], follow_up: { due_at: '2026-11-01T00:00:00+00:00', propose_no_answer: false } })],
    }));

    const coche = (id: number) => screen.getByRole('checkbox', { name: `Choisir l’annonce n° ${id} pour le message` });
    expect(coche(1)).toBeEnabled();
    expect(coche(2)).toBeDisabled();
    expect(coche(3)).toBeDisabled();
    expect(coche(4)).toBeDisabled();
    expect(coche(5)).toBeDisabled();
    // Une annonce contactée dont le message est clos (sans message ouvert) se coche de nouveau.
    expect(coche(6)).toBeEnabled();

    expect(screen.getByText('Déjà couverte par un accord valide')).toBeInTheDocument();
    expect(screen.getByText('Pas encore relue')).toBeInTheDocument();
    expect(screen.getByText('Close : plus rien à démarcher')).toBeInTheDocument();
    expect(screen.getByText('Un message envoyé attend sa réponse')).toBeInTheDocument();
  });
});

describe('RadarAdvertiserCard — la prise en charge (TCK-2388)', () => {
  it('non prise en charge : les gestes sont désactivés, « Prendre en charge » envoie POST claim', async () => {
    vi.mocked(claimRadarAdvertiser).mockResolvedValue({ data: { claim: prise() } });
    const { utilisateur } = await rendre(annonceur({ claim: null }));

    expect(screen.getByTestId('radar-annonceur-prise')).toHaveAttribute('data-etat', 'libre');
    expect(screen.getByRole('checkbox', { name: /annonce n° 12/ })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'English' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Préparer le message' })).toBeDisabled();

    await utilisateur.click(screen.getByRole('button', { name: 'Prendre en charge' }));

    await waitFor(() => expect(claimRadarAdvertiser).toHaveBeenCalledWith(7));
  });

  it('prise par moi : le bandeau dit jusqu\'à quand, « Rendre » envoie DELETE claim, et les gestes sont ouverts', async () => {
    vi.mocked(releaseRadarAdvertiser).mockResolvedValue(undefined);
    const { utilisateur } = await rendre();

    const bandeau = screen.getByTestId('radar-annonceur-prise');
    expect(bandeau).toHaveAttribute('data-etat', 'moi');
    expect(bandeau).toHaveTextContent(/Vous traitez cet annonceur, jusqu’à /);
    expect(screen.getByRole('checkbox', { name: /annonce n° 12/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Prendre en charge' })).not.toBeInTheDocument();

    await utilisateur.click(screen.getByRole('button', { name: 'Rendre' }));
    await waitFor(() => expect(releaseRadarAdvertiser).toHaveBeenCalledWith(7));
  });

  it('prise par un autre : le bandeau le nomme, ni « Prendre » ni « Rendre », les gestes sont désactivés', async () => {
    await rendre(annonceur({
      claim: prise({ mine: false, by: { id: 2, name: 'Fatou Sow' } }),
      outreaches: [message()],
    }));

    const bandeau = screen.getByTestId('radar-annonceur-prise');
    expect(bandeau).toHaveAttribute('data-etat', 'autre');
    expect(bandeau).toHaveTextContent(/Fatou Sow traite cet annonceur, jusqu’à /);
    expect(within(bandeau).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /annonce n° 12/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Préparer le message' })).toBeDisabled();
    // Le message préparé se lit, rien ne s'y écrit ni ne s'envoie, et WhatsApp ne s'ouvre pas.
    expect(screen.getByLabelText('Salutation')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'J’ai envoyé le message' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it('« ne pas contacter » : un bandeau, et aucun geste, même avec une prise à soi', async () => {
    await rendre(annonceur({ do_not_contact_at: '2026-10-20T08:00:00+00:00', outreaches: [message()] }));

    expect(screen.getByTestId('radar-annonceur-stop')).toHaveTextContent(/a demandé à ne plus être contacté/);
    expect(screen.getByRole('checkbox', { name: /annonce n° 12/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Préparer le message' })).toBeDisabled();
    // Restituer une prise est sans danger : « Rendre » reste ouvert sous STOP, pas « Prendre en charge ».
    expect(screen.getByRole('button', { name: 'Rendre' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'J’ai envoyé le message' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it('« ne pas contacter » sans prise : « Prendre en charge » reste fermé', async () => {
    await rendre(annonceur({ do_not_contact_at: '2026-10-20T08:00:00+00:00', claim: null }));
    expect(screen.getByRole('button', { name: 'Prendre en charge' })).toBeDisabled();
  });

  it('le bandeau n\'est pas une région vive : le renouvellement de « jusqu\'à » ne s\'annonce pas', async () => {
    await rendre();
    expect(screen.getByTestId('radar-annonceur-prise')).not.toHaveAttribute('role');
    expect(within(screen.getByTestId('radar-annonceur-prise')).queryByRole('status')).not.toBeInTheDocument();
  });

  it('un 409 claimed_by_other s\'affiche par son libellé, avec l\'heure, et relit la fiche', async () => {
    vi.mocked(claimRadarAdvertiser).mockRejectedValue(
      erreur409('radar.advertiser.claimed_by_other', { claimed_until: '2026-10-28T11:30:00+00:00' }),
    );
    const { utilisateur } = await rendre(annonceur({ claim: null }));
    expect(fetchRadarAdvertiser).toHaveBeenCalledTimes(1);

    await utilisateur.click(screen.getByRole('button', { name: 'Prendre en charge' }));

    expect(await screen.findByTestId('radar-annonceur-erreur')).toHaveTextContent(
      /Cet annonceur est pris en charge par un autre opérateur jusqu’à .*2026/,
    );
    await waitFor(() => expect(fetchRadarAdvertiser).toHaveBeenCalledTimes(2));
  });

  it('une panne sans code connu s\'affiche par le libellé de la plateforme, pas par une clé ni un code brut', async () => {
    vi.mocked(claimRadarAdvertiser).mockRejectedValue(new ApiError(500, {}));
    const { utilisateur } = await rendre(annonceur({ claim: null }));

    await utilisateur.click(screen.getByRole('button', { name: 'Prendre en charge' }));

    expect(await screen.findByTestId('radar-annonceur-erreur')).toHaveTextContent('Le serveur a rencontré une erreur.');
  });
});

describe('RadarAdvertiserCard — préparer le message (TCK-2388)', () => {
  it('cocher deux annonces, choisir « en », préparer → POST {listing_ids: [12, 13], locale: "en"} ; l\'aperçu vient de la relecture', async () => {
    // L'IA n'a rien rédigé : le message enregistré a ses deux parties vides.
    const sansParties = message({ salutation: '', summary: '', wa_me_url: null, segments: SEGMENTS.map((x) => (x.kind === 'fixed' ? x : { ...x, text: '' })) });
    vi.mocked(prepareRadarOutreach).mockImplementation(async () => {
      // L'API enregistre le message : la relecture le porte.
      serveur = { ...serveur, outreaches: [sansParties] };
      return { data: { ...sansParties, generated: false, ai_error: 'ai.budget' } };
    });
    const { utilisateur } = await rendre();

    expect(screen.getByRole('radio', { name: 'Français' })).toBeChecked();
    await utilisateur.click(screen.getByRole('checkbox', { name: 'Choisir l’annonce n° 13 pour le message' }));
    await utilisateur.click(screen.getByRole('checkbox', { name: 'Choisir l’annonce n° 12 pour le message' }));
    expect(screen.getByText('2 annonces choisies')).toBeInTheDocument();
    await utilisateur.click(screen.getByRole('radio', { name: 'English' }));
    await utilisateur.click(screen.getByRole('button', { name: 'Préparer le message' }));

    await waitFor(() => expect(prepareRadarOutreach).toHaveBeenCalledWith(7, { listing_ids: [12, 13], locale: 'en' }));
    const apercu = await screen.findByTestId('radar-annonceur-apercu');
    // Le motif que l'API a donné (`ai_error`) se lit par le libellé de la passerelle, jamais brut.
    expect(within(apercu).getByTestId('radar-annonceur-ia-absente')).toHaveTextContent(/L’IA n’a pas rédigé/);
    expect(within(apercu).getByTestId('radar-annonceur-ia-absente')).toHaveTextContent(/plafond de dépense IA/);
    // La sélection est vidée : un message de plus ne repart pas des mêmes annonces par mégarde.
    expect(screen.getByText('Aucune annonce choisie')).toBeInTheDocument();
  });

  it('un `ai_error` sur un message dont les deux parties sont écrites n\'affiche aucun bandeau « l\'IA n\'a pas rédigé »', async () => {
    vi.mocked(prepareRadarOutreach).mockImplementation(async () => {
      serveur = { ...serveur, outreaches: [message()] };
      return { data: { ...message(), generated: false, ai_error: 'ai.budget' } };
    });
    const { utilisateur } = await rendre();

    await utilisateur.click(screen.getByRole('checkbox', { name: /annonce n° 12/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Préparer le message' }));

    const apercu = await screen.findByTestId('radar-annonceur-apercu');
    expect(within(apercu).queryByTestId('radar-annonceur-ia-absente')).not.toBeInTheDocument();
  });

  it('sans annonce cochée, « Préparer » reste fermé', async () => {
    await rendre();
    expect(screen.getByRole('button', { name: 'Préparer le message' })).toBeDisabled();
  });

  it('un message sans salutation ni résumé le dit, même sans `ai_error` (fiche relue)', async () => {
    await rendre(annonceur({
      outreaches: [message({ salutation: '', summary: '', wa_me_url: null, segments: SEGMENTS.map((s) => (s.kind === 'fixed' ? s : { ...s, text: '' })) })],
    }));

    expect(screen.getByTestId('radar-annonceur-ia-absente')).toHaveTextContent(/remplissez les deux champs/);
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'J’ai envoyé le message' })).toBeDisabled();
  });

  it('une préparation refusée affiche le libellé du code, et relit la fiche', async () => {
    vi.mocked(prepareRadarOutreach).mockRejectedValue(new ApiError(422, { code: 'radar.outreach.listing_pending', params: { listing_id: 12 } }));
    const { utilisateur } = await rendre();

    await utilisateur.click(screen.getByRole('checkbox', { name: /annonce n° 12/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Préparer le message' }));

    expect(await screen.findByTestId('radar-annonceur-erreur')).toHaveTextContent(/attend encore une issue/);
    await waitFor(() => expect(fetchRadarAdvertiser).toHaveBeenCalledTimes(2));
  });
});

describe('RadarAdvertiserCard — l\'aperçu du message (TCK-2388)', () => {
  it('les segments figés ne sont pas éditables, la salutation et le résumé le sont ; le texte affiché est celui de l\'API', async () => {
    await rendre(annonceur({ outreaches: [message()] }));

    const figes = screen.getAllByRole('textbox', { name: /Texte figé/ });
    expect(figes).toHaveLength(3);
    for (const fige of figes) {
      expect(fige).toHaveAttribute('aria-readonly', 'true');
      expect(fige.tagName).not.toBe('TEXTAREA');
      expect(fige).not.toHaveAttribute('contenteditable');
    }
    const salutation = screen.getByLabelText('Salutation');
    const resume = screen.getByLabelText('Résumé de l’annonce');
    expect(salutation.tagName).toBe('TEXTAREA');
    expect(resume.tagName).toBe('TEXTAREA');
    expect(salutation).toBeEnabled();

    // La concaténation de ce qui est affiché, dans l'ordre, est EXACTEMENT le message enregistré.
    const affiche = [...screen.getByTestId('radar-message-segments').children]
      .map((segment) => {
        const champ = segment.querySelector('textarea');
        return champ ? champ.value : segment.textContent;
      })
      .join('');
    expect(affiche).toBe(MESSAGE_PREPARE);
  });

  it('retoucher la salutation envoie PATCH avec cette seule clé ; l\'aperçu se relit depuis la réponse', async () => {
    // L'API rogne et normalise : elle rend « Bonsoir Awa, », pas ce qui a été tapé.
    const retouche = message({
      salutation: 'Bonsoir Awa,',
      message: MESSAGE_PREPARE.replace('Bonjour Awa,', 'Bonsoir Awa,'),
      segments: SEGMENTS.map((s) => (s.kind === 'salutation' ? { ...s, text: 'Bonsoir Awa,' } : s)),
      wa_me_url: 'https://wa.me/221771234567?text=retouche',
    });
    vi.mocked(retouchRadarOutreach).mockImplementation(async () => {
      serveur = { ...serveur, outreaches: [retouche] };
      return { data: retouche };
    });
    const { utilisateur } = await rendre(annonceur({ outreaches: [message()] }));

    const enregistrer = screen.getByRole('button', { name: 'Enregistrer' });
    expect(enregistrer).toBeDisabled();
    const salutation = screen.getByLabelText('Salutation');
    await utilisateur.clear(salutation);
    await utilisateur.type(salutation, 'Bonsoir  Awa,\n');
    expect(enregistrer).toBeEnabled();
    await utilisateur.click(enregistrer);

    await waitFor(() => expect(retouchRadarOutreach).toHaveBeenCalledWith(5, { salutation: 'Bonsoir  Awa,\n' }));
    const envoye = vi.mocked(retouchRadarOutreach).mock.calls[0][1];
    expect(Object.keys(envoye)).toEqual(['salutation']);
    // Le texte vient de l'API : le lien WhatsApp est celui de la réponse, et le champ porte ce qu'elle a rendu.
    await waitFor(() => expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/221771234567?text=retouche'));
    expect(screen.getByLabelText('Salutation')).toHaveValue('Bonsoir Awa,');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('une retouche faite d\'espaces seuls se réaligne sur la valeur de l\'API : plus de retouche en suspens, WhatsApp se rouvre', async () => {
    // L'API rogne l'espace final : le texte rendu est celui d'avant, la clé de l'aperçu ne change pas.
    vi.mocked(retouchRadarOutreach).mockResolvedValue({ data: message() });
    const { utilisateur } = await rendre(annonceur({ outreaches: [message()] }));

    await utilisateur.type(screen.getByLabelText('Salutation'), ' ');
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(retouchRadarOutreach).toHaveBeenCalledWith(5, { salutation: 'Bonjour Awa, ' }));
    await waitFor(() => expect(screen.getByLabelText('Salutation')).toHaveValue('Bonjour Awa,'));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.queryByText(/Enregistrez vos retouches/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'J’ai envoyé le message' })).toBeEnabled();
  });

  it('retoucher le seul résumé n\'envoie que `resume` : la salutation intacte ne part pas', async () => {
    vi.mocked(retouchRadarOutreach).mockResolvedValue({ data: message() });
    const { utilisateur } = await rendre(annonceur({ outreaches: [message()] }));

    await utilisateur.type(screen.getByLabelText('Résumé de l’annonce'), ' (neuf)');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(retouchRadarOutreach).toHaveBeenCalledTimes(1));
    expect(vi.mocked(retouchRadarOutreach).mock.calls[0]).toEqual([5, { resume: 'F3 aux Almadies, 350 000 F CFA par mois (neuf)' }]);
  });

  it('retoucher les deux champs les envoie tous les deux, et seulement ceux-là', async () => {
    vi.mocked(retouchRadarOutreach).mockResolvedValue({ data: message() });
    const { utilisateur } = await rendre(annonceur({ outreaches: [message()] }));

    await utilisateur.type(screen.getByLabelText('Salutation'), '!');
    await utilisateur.type(screen.getByLabelText('Résumé de l’annonce'), ' (neuf)');
    await utilisateur.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(retouchRadarOutreach).toHaveBeenCalledWith(5, {
      salutation: 'Bonjour Awa,!',
      resume: 'F3 aux Almadies, 350 000 F CFA par mois (neuf)',
    }));
  });

  it('un champ vidé ne s\'enregistre pas', async () => {
    const { utilisateur } = await rendre(annonceur({ outreaches: [message()] }));

    await utilisateur.clear(screen.getByLabelText('Salutation'));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(retouchRadarOutreach).not.toHaveBeenCalled();
  });

  it('le lien WhatsApp a exactement `wa_me_url` pour href, s\'ouvre à part, et n\'existe pas quand il est nul', async () => {
    const { queryClient } = await rendre(annonceur({ outreaches: [message()] }));

    const lien = screen.getByRole('link', { name: /Ouvrir WhatsApp/ });
    expect(lien).toHaveAttribute('href', WA_ME);
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAttribute('rel', 'noopener noreferrer');

    // Plus de lien dès que l'API n'en rend plus (STOP, parties vides) : la fiche relue le retire.
    serveur = { ...serveur, outreaches: [message({ wa_me_url: null })] };
    await queryClient.invalidateQueries();
    await waitFor(() => expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument());
  });

  it('une retouche non enregistrée ferme WhatsApp et « J\'ai envoyé » : l\'API n\'ouvre que le texte enregistré', async () => {
    const { utilisateur } = await rendre(annonceur({ outreaches: [message()] }));
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toBeInTheDocument();

    await utilisateur.type(screen.getByLabelText('Résumé de l’annonce'), ' bis');

    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'J’ai envoyé le message' })).toBeDisabled();
    expect(screen.getByText(/WhatsApp n’ouvre que le texte enregistré/)).toBeInTheDocument();
  });

  it('« J\'ai envoyé le message » demande confirmation, puis envoie POST sent', async () => {
    vi.mocked(markRadarOutreachSent).mockImplementation(async () => {
      const envoye = message({ status: 'sent', sent_at: '2026-10-28T10:00:00+00:00', wa_me_url: null });
      serveur = { ...serveur, outreaches: [envoye] };
      return { data: envoye };
    });
    const { utilisateur } = await rendre(annonceur({ outreaches: [message()] }));

    await utilisateur.click(screen.getByRole('button', { name: 'J’ai envoyé le message' }));
    // Rien ne part tant que la confirmation n'est pas donnée.
    expect(markRadarOutreachSent).not.toHaveBeenCalled();
    const dialogue = await screen.findByRole('dialog');
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Oui, je l’ai envoyé' }));

    await waitFor(() => expect(markRadarOutreachSent).toHaveBeenCalledWith(5));
    // Le message quitte l'aperçu et entre dans l'historique, avec son statut.
    await waitFor(() => expect(screen.queryByTestId('radar-annonceur-apercu')).not.toBeInTheDocument());
    expect(within(screen.getByTestId('radar-annonceur-historique')).getByText('Envoyé')).toBeInTheDocument();
  });

  it('annuler la confirmation n\'envoie rien', async () => {
    const { utilisateur } = await rendre(annonceur({ outreaches: [message()] }));

    await utilisateur.click(screen.getByRole('button', { name: 'J’ai envoyé le message' }));
    const dialogue = await screen.findByRole('dialog');
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Annuler' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(markRadarOutreachSent).not.toHaveBeenCalled();
  });

  it('un message écrit avec un autre gabarit se lit tel qu\'enregistré, sans champ à retoucher', async () => {
    await rendre(annonceur({
      outreaches: [message({ segments: [{ kind: 'fixed', text: MESSAGE_PREPARE }] })],
    }));

    expect(screen.getByText(/écrit avec un autre gabarit/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Salutation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
  });
});

describe('RadarAdvertiserCard — l\'accès (TCK-2388)', () => {
  it('une erreur de chargement se dit, avec de quoi réessayer', async () => {
    vi.mocked(fetchRadarAdvertiser).mockRejectedValue(new ApiError(500, {}));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RadarAdvertiserCard id={7} />)}</QueryClientProvider>));

    expect(await screen.findByText(/L’annonceur n’a pas pu être chargé/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('sans le geste platform.radar.operate : un refus, et aucun appel', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={queryClient}>
        {avecGestes(<RadarAdvertiserCard id={7} />, { level: 'viewer', abilities: [] })}
      </QueryClientProvider>,
    ));

    expect(await screen.findByText(/réservé aux opérateurs/)).toBeInTheDocument();
    expect(fetchRadarAdvertiser).not.toHaveBeenCalled();
  });
});

describe('RadarAdvertiserCard — correctifs de revue (TCK-2388)', () => {
  it('le renouvellement de la prise ne ferme aucun champ : le focus et la frappe en cours restent', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      // Le renouvellement part et reste en vol : on regarde la fiche PENDANT l'appel.
      let resoudre!: (reponse: Awaited<ReturnType<typeof claimRadarAdvertiser>>) => void;
      vi.mocked(claimRadarAdvertiser).mockReset().mockImplementation(() => new Promise((resolve) => { resoudre = resolve; }));
      monter(annonceur({ outreaches: [message()] }));
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });

      const salutation = screen.getByLabelText('Salutation');
      act(() => salutation.focus());
      expect(salutation).toHaveFocus();

      // La prise de `mocks.prise()` échoit à 10:10 : mi-durée, 5 minutes.
      await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
      expect(claimRadarAdvertiser).toHaveBeenCalledTimes(1);

      expect(screen.getByLabelText('Salutation')).toBeEnabled();
      expect(screen.getByLabelText('Salutation')).toHaveFocus();
      expect(screen.getByLabelText('Résumé de l’annonce')).toBeEnabled();
      expect(screen.getByRole('checkbox', { name: /annonce n° 12/ })).toBeEnabled();
      expect(screen.getByRole('radio', { name: 'English' })).toBeEnabled();
      // Mais « Rendre » se ferme le temps du renouvellement : il ne doit pas croiser une restitution.
      expect(screen.getByRole('button', { name: 'Rendre' })).toBeDisabled();

      await act(async () => {
        resoudre({ data: { claim: prise({ until: '2026-10-28T10:20:00+00:00' }) } });
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(screen.getByRole('button', { name: 'Rendre' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('préparer alors qu\'un brouillon existe demande confirmation : rien ne part avant', async () => {
    vi.mocked(prepareRadarOutreach).mockResolvedValue({ data: { ...message({ id: 6 }), generated: true, ai_error: null } });
    const { utilisateur } = await rendre(annonceur({ outreaches: [message()] }));

    await utilisateur.click(screen.getByRole('checkbox', { name: /annonce n° 13/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Préparer le message' }));

    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent(/le remplace/);
    expect(dialogue).toHaveTextContent(/J’ai envoyé le message/);
    expect(prepareRadarOutreach).not.toHaveBeenCalled();

    // Annuler : rien n'est parti, le choix d'annonces reste.
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Annuler' }));
    expect(prepareRadarOutreach).not.toHaveBeenCalled();
    expect(screen.getByText('1 annonce choisie')).toBeInTheDocument();

    await utilisateur.click(screen.getByRole('button', { name: 'Préparer le message' }));
    await utilisateur.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remplacer le brouillon' }));
    await waitFor(() => expect(prepareRadarOutreach).toHaveBeenCalledWith(7, { listing_ids: [13], locale: 'fr' }));
  });

  it('sans brouillon, préparer part tout de suite, sans confirmation', async () => {
    vi.mocked(prepareRadarOutreach).mockResolvedValue({ data: { ...message({ id: 6 }), generated: true, ai_error: null } });
    const { utilisateur } = await rendre();

    await utilisateur.click(screen.getByRole('checkbox', { name: /annonce n° 12/ }));
    await utilisateur.click(screen.getByRole('button', { name: 'Préparer le message' }));

    await waitFor(() => expect(prepareRadarOutreach).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('une annonce cochée qui n\'est plus cochable après une relecture sort de la sélection', async () => {
    vi.mocked(prepareRadarOutreach).mockRejectedValue(new ApiError(422, { code: 'radar.outreach.listing_consented', params: { listing_id: 12 } }));
    const { utilisateur } = await rendre();

    await utilisateur.click(screen.getByRole('checkbox', { name: /annonce n° 12/ }));
    await utilisateur.click(screen.getByRole('checkbox', { name: /annonce n° 13/ }));
    expect(screen.getByText('2 annonces choisies')).toBeInTheDocument();

    // Entre-temps l'annonce 12 est couverte par un accord : le refus relit la fiche.
    serveur = { ...serveur, listings: serveur.listings.map((a) => (a.id === 12 ? { ...a, stage: 'consented', covered_by_consent: true } : a)) };
    await utilisateur.click(screen.getByRole('button', { name: 'Préparer le message' }));

    expect(await screen.findByText('1 annonce choisie')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /annonce n° 12/ })).not.toBeChecked();

    vi.mocked(prepareRadarOutreach).mockReset().mockResolvedValue({ data: { ...message({ id: 6 }), generated: true, ai_error: null } });
    await utilisateur.click(screen.getByRole('button', { name: 'Préparer le message' }));
    await waitFor(() => expect(prepareRadarOutreach).toHaveBeenCalledWith(7, { listing_ids: [13], locale: 'fr' }));
  });
});
