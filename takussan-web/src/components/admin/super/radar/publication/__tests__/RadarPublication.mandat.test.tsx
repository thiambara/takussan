import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  fetchRadarAdvertiser,
  fetchRadarPublicationPreview,
  fetchRadarPublishedMessage,
  publishRadarAdvertiser,
  publishRadarAdvertiserUnderMandate,
} from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarMandatePreview, RadarPublicationPreview } from '@/types/radar';
import { annonceur } from '../../annonceur/__tests__/mocks';
import { RadarPublication } from '../RadarPublication';
import { apercu, messagePublie, publiee } from './mocks';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  fetchRadarAdvertiser: vi.fn(),
  fetchRadarPublicationPreview: vi.fn(),
  publishRadarAdvertiser: vi.fn(),
  publishRadarAdvertiserUnderMandate: vi.fn(),
  fetchRadarPublishedMessage: vi.fn(),
}));

const ESPACE = { id: 300, name: 'Takussan Mandats' };
const mandat = (partiel: Partial<RadarMandatePreview> = {}): RadarMandatePreview => ({ enabled: true, space: ESPACE, blocking: [], ...partiel });

async function rendre(detail: RadarPublicationPreview) {
  vi.mocked(fetchRadarPublicationPreview).mockImplementation(async () => ({ data: detail }));
  vi.mocked(fetchRadarAdvertiser).mockImplementation(async () => ({ data: annonceur() }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<RadarPublication id={7} />)}
    </QueryClientProvider>,
  ));
  await screen.findByTestId('radar-publication');
  return { utilisateur: userEvent.setup() };
}

const publierPourLui = () => screen.getByRole('button', { name: /^Publier \d+ annonces?$|^Publier$/ });
const publierSousMandat = () => screen.getByRole('button', { name: /sous mandat$/ });

beforeEach(() => {
  vi.mocked(fetchRadarAdvertiser).mockReset();
  vi.mocked(fetchRadarPublicationPreview).mockReset();
  vi.mocked(publishRadarAdvertiser).mockReset();
  vi.mocked(publishRadarAdvertiserUnderMandate).mockReset();
  vi.mocked(fetchRadarPublishedMessage).mockReset();
  vi.mocked(fetchRadarPublishedMessage).mockResolvedValue({ data: messagePublie({ version: 'mandat.v1' }) });
});

/**
 * TCK-2394 (ADR-0079, proposé) — la publication sous mandat Takussan sur l'écran « Publier pour lui » : rien tant que le
 * drapeau est éteint ; allumé, un compte impossible (numéro inscrit, connexion par téléphone éteinte) laisse publier sous
 * mandat, dans l'espace des mandats, sans compte.
 */
describe('RadarPublication — sous mandat (TCK-2394)', () => {
  it('drapeau éteint : aucune trace du mandat, et un blocage du compte ferme tout comme avant', async () => {
    await rendre(apercu({ blocking: ['radar.advertiser.phone_registered'] }));

    expect(screen.queryByTestId('radar-publication-mandat')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sous mandat/ })).not.toBeInTheDocument();
    expect(within(screen.getByTestId('radar-publication-blocage')).getByText('La publication est impossible pour l’instant :')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 12' })).toBeDisabled();
  });

  it('drapeau allumé, numéro déjà inscrit : « Publier pour lui » reste fermé, les annonces se cochent, le mandat est offert', async () => {
    await rendre(apercu({ blocking: ['radar.advertiser.phone_registered'], mandate: mandat() }));

    expect(within(screen.getByTestId('radar-publication-blocage')).getByText('La publication pour son compte est impossible pour l’instant :')).toBeInTheDocument();
    expect(publierPourLui()).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 12' })).toBeEnabled();
    const section = screen.getByTestId('radar-publication-mandat');
    const texte = within(section).getByText(/dans son propre espace, « Takussan Mandats »/);
    // ADR-0079 § 5 — le numéro affiché est celui de l'annonceur ; le formulaire, lui, va à l'administrateur de l'espace.
    expect(texte).toHaveTextContent('Le téléphone et le WhatsApp affichés sont ceux de l’annonceur');
    expect(texte).toHaveTextContent('Les demandes laissées par formulaire arrivent à l’administrateur de « Takussan Mandats », qui les lui transmet.');
    expect(publierSousMandat()).toHaveTextContent('Publier 2 annonces sous mandat');
    expect(publierSousMandat()).toBeEnabled();
  });

  it('confirmer publie sous mandat, sous sa propre Idempotency-Key, puis le récapitulatif nomme l\'espace et le message ne promet aucune activation', async () => {
    vi.mocked(publishRadarAdvertiserUnderMandate).mockResolvedValue({
      data: publiee({ user: null, agency: { id: 300, name: 'Takussan Mandats', slug: 'takussan-mandats' }, created_account: false, mandate: true }),
    });
    const { utilisateur } = await rendre(apercu({ blocking: ['radar.publish.activation_unavailable'], mandate: mandat() }));

    await utilisateur.click(publierSousMandat());
    const dialogue = await screen.findByRole('dialog');
    expect(within(dialogue).getByRole('heading', { name: 'Publier sous mandat pour Moussa Immo ?' })).toBeInTheDocument();
    expect(within(dialogue).getByTestId('radar-publication-resume'))
      .toHaveTextContent('Aucun compte, 2 biens publiés dans l’espace « Takussan Mandats » avec 4 photos.');
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));

    const recap = await screen.findByTestId('radar-publication-recap');
    expect(publishRadarAdvertiser).not.toHaveBeenCalled();
    const [id, ids, cle] = vi.mocked(publishRadarAdvertiserUnderMandate).mock.calls[0];
    expect([id, ids]).toEqual([7, [12, 13]]);
    expect(cle).toMatch(/^[0-9a-f-]{36}$/);
    expect(within(recap).getByTestId('radar-publication-recap-compte'))
      .toHaveTextContent('Publié sous mandat dans l’espace « Takussan Mandats » : aucun compte n’a été créé.');
    expect(within(recap).getByText(/sans lien d’activation/)).toBeInTheDocument();
  });

  it('un compte déjà rattaché : le mandat est nommé bloqué, « Publier pour lui » reste le geste', async () => {
    await rendre(apercu({
      account: { exists: true, first_name: 'Moussa', last_name: 'Immo', phone: '+221741234567', space_name: 'x' },
      mandate: mandat({ blocking: ['radar.mandate.account_exists'] }),
    }));

    const blocage = screen.getByTestId('radar-publication-mandat-blocage');
    expect(within(blocage).getByText(/Un compte est déjà rattaché à cet annonceur/)).toBeInTheDocument();
    expect(publierSousMandat()).toBeDisabled();
    expect(publierPourLui()).toBeEnabled();
  });

  it('sans espace des mandats : le panneau dit où le désigner, et le blocage le nomme', async () => {
    await rendre(apercu({
      blocking: ['radar.advertiser.phone_registered'],
      mandate: mandat({ space: null, blocking: ['radar.mandate.space_missing'] }),
    }));

    const section = screen.getByTestId('radar-publication-mandat');
    expect(within(section).getByText(/Espace des mandats du Radar/)).toBeInTheDocument();
    expect(within(section).getByText(/Aucun espace des mandats n’est désigné/)).toBeInTheDocument();
    expect(publierSousMandat()).toBeDisabled();
    // Ni le compte ni le mandat : rien ne se coche.
    expect(screen.getByRole('checkbox', { name: 'Publier l’annonce n° 12' })).toBeDisabled();
  });

  it('déjà sous mandat, connexion par téléphone éteinte : le message des biens en ligne se compose quand même (mandat.v1)', async () => {
    await rendre(apercu({
      advertiser: { ...apercu().advertiser, mandate_at: '2026-10-29T10:00:00+00:00' },
      listings: [],
      blocking: ['radar.publish.nothing_covered', 'radar.publish.activation_unavailable', 'radar.publish.under_mandate'],
      published: publiee().properties,
      mandate: mandat({ blocking: ['radar.publish.nothing_covered'] }),
    }));

    expect(screen.getByTestId('radar-publication-mandat-depuis')).toHaveTextContent(/Déjà publié sous mandat depuis le/);
    expect(within(screen.getByTestId('radar-publication-blocage')).getByText(/publié sous mandat Takussan/)).toBeInTheDocument();
    const section = screen.getByTestId('radar-publication-deja');
    expect(within(section).queryByTestId('radar-publication-deja-indisponible')).not.toBeInTheDocument();
    expect(await within(section).findByTestId('radar-publication-message-texte')).toBeInTheDocument();
    expect(within(section).getByText(/sans lien d’activation/)).toBeInTheDocument();
    await waitFor(() => expect(fetchRadarPublishedMessage).toHaveBeenCalledWith(7, 'fr'));
  });

  it('un refus de l\'API (drapeau éteint entre-temps) garde le dialogue ouvert et se nomme', async () => {
    vi.mocked(publishRadarAdvertiserUnderMandate).mockRejectedValue(new ApiError(422, { code: 'radar.mandate.disabled' }));
    const { utilisateur } = await rendre(apercu({ blocking: ['radar.advertiser.phone_registered'], mandate: mandat() }));

    await utilisateur.click(publierSousMandat());
    const dialogue = await screen.findByRole('dialog');
    await utilisateur.click(within(dialogue).getByRole('button', { name: 'Publier' }));

    expect(await within(dialogue).findByTestId('radar-publication-confirm-erreur'))
      .toHaveTextContent('La publication sous mandat est éteinte dans cet environnement.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
