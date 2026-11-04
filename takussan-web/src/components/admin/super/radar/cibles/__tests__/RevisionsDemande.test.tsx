import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { fetchRadarTargetRevisions, revertRadarTargetRevision } from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarTargetCriteria, RadarTargetRevision } from '@/types/radar';
import { RevisionsDemande } from '../RevisionsDemande';

vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => '/super-admin/radar/targets/revisions',
}));

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRadarDashboard: vi.fn(async () => ({ data: { follow_ups_due: 0 } })),
  fetchRadarTargetRevisions: vi.fn(),
  revertRadarTargetRevision: vi.fn(),
}));

const SUPPORT: PlatformAbilities = { level: 'support', abilities: ['platform.console.access', 'platform.radar.operate'] };

const SANS_CRITERE: RadarTargetCriteria = {
  cities: [], neighborhoods: [], types: [], contract: null, price_min: null, price_max: null,
  bedrooms_min: null, bedrooms_max: null, furnished: null, sites: [], max_age_days: null,
};

const LOCATION_ALMADIES: RadarTargetCriteria = {
  ...SANS_CRITERE, types: ['apartment'], contract: 'rent', neighborhoods: [{ name: 'Almadies', city: 'Dakar' }], price_max: 700000,
};

/** Une révision qui fait les quatre opérations, et dont deux propositions ont été écartées. */
const REVISION: RadarTargetRevision = {
  id: 3,
  operations: [
    {
      op: 'merge', target_id: 12, merge_ids: [12, 14], name: 'Appartements à louer, Almadies et Ngor',
      criteria: LOCATION_ALMADIES, reason: 'Deux demandes voisines.', signal_refs: ['d1', 'd2'],
    },
    { op: 'retire', target_id: 9, merge_ids: [], name: null, criteria: null, reason: 'Plus aucune demande.', signal_refs: [] },
    {
      op: 'create', target_id: 21, merge_ids: [], name: 'Villas à vendre à Saly',
      criteria: { ...SANS_CRITERE, types: ['villa'], contract: 'sale' }, reason: 'Demande nouvelle.', signal_refs: ['d4'],
    },
    {
      op: 'update', target_id: 15, merge_ids: [], name: 'Studios meublés',
      criteria: { ...SANS_CRITERE, types: ['studio'], furnished: true }, reason: 'Les visiteurs veulent du meublé.', signal_refs: ['d5'],
    },
  ],
  discarded: [
    {
      op: 'retire', target_id: 4, merge_ids: [], name: '', target_name: 'Bureaux du Plateau', reason: 'Plus demandée.',
      code: 'radar.demand.target_protected', params: { target_id: 4 },
    },
    {
      op: 'create', target_id: null, merge_ids: [], name: 'Tout Dakar', reason: 'Large.',
      code: 'radar.demand.too_many', params: { max: 20 },
    },
    { op: 'explode', target_id: null, merge_ids: [], name: null, reason: null, code: 'radar.demand.code_inconnu' },
  ],
  before: [
    { id: 12, name: 'Appartements Almadies', status: 'active', pinned: false, criteria: LOCATION_ALMADIES, demand_count: 3 },
    { id: 14, name: 'Appartements Ngor', status: 'active', pinned: false, criteria: LOCATION_ALMADIES, demand_count: 2 },
    { id: 9, name: 'Terrains Diamniadio', status: 'active', pinned: false, criteria: SANS_CRITERE, demand_count: 1 },
    { id: 21, created: true },
    { id: 15, name: 'Studios', status: 'active', pinned: false, criteria: SANS_CRITERE, demand_count: 4 },
  ],
  signals_count: 5,
  reverted_at: null,
  reverted_by_id: null,
  reverted_by: null,
  created_at: '2026-11-04T03:40:02+00:00',
};

const DEFAITE: RadarTargetRevision = {
  ...REVISION,
  id: 2,
  operations: [],
  discarded: [],
  before: [],
  signals_count: 1,
  reverted_at: '2026-11-04T09:00:00+00:00',
  reverted_by_id: 7,
  reverted_by: { id: 7, name: 'Awa N.' },
};

const page = (data: RadarTargetRevision[]) => ({
  data,
  meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length, from: 1, to: data.length },
}) as never;

function rendre(gestes?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RevisionsDemande />, gestes)}</QueryClientProvider>));
  return userEvent.setup();
}

async function ouvrirDefaire(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId('radar-revision-3-defaire'));
  const dialogue = await screen.findByRole('dialog');
  expect(dialogue).toHaveTextContent('Défaire la révision n° 3 ?');
  await user.click(within(dialogue).getByTestId('radar-revision-defaire-confirmer'));
  return dialogue;
}

beforeEach(() => {
  vi.mocked(fetchRadarTargetRevisions).mockReset().mockResolvedValue(page([REVISION, DEFAITE]));
  vi.mocked(revertRadarTargetRevision).mockReset();
});

describe('L\'historique des révisions de la demande (TCK-2470)', () => {
  it('chaque opération se lit : créée, réglée, fusion, retirée — avec les noms des cibles, leurs critères et le motif de l\'IA', async () => {
    rendre();

    const carte = await screen.findByTestId('radar-revision-3');
    expect(carte).toHaveTextContent('Révision n° 3');
    expect(carte).toHaveTextContent('5 demandes lues');
    expect(within(carte).getByTestId('radar-revision-3-etat')).toHaveTextContent('Appliquée');

    const [fusion, retrait, creation, reglage] = within(carte).getAllByTestId('radar-revision-3-op');
    expect(fusion).toHaveTextContent('Fusion « Appartements à louer, Almadies et Ngor » (anciennement « Appartements Almadies ») réunit « Appartements Ngor »');
    expect(fusion).toHaveTextContent(/Appartement · location · Almadies · jusqu’à 700\s000\sF\sCFA/u);
    expect(fusion).toHaveTextContent('Motif de l’IA : Deux demandes voisines.');
    expect(within(fusion).getByRole('link', { name: '« Appartements à louer, Almadies et Ngor »' }))
      .toHaveAttribute('href', '/super-admin/radar/targets/12');

    expect(retrait).toHaveTextContent('Retirée « Terrains Diamniadio »');
    expect(retrait).toHaveTextContent('Motif de l’IA : Plus aucune demande.');
    expect(creation).toHaveTextContent('Créée « Villas à vendre à Saly »');
    expect(within(creation).getByRole('link')).toHaveAttribute('href', '/super-admin/radar/targets/21');
    expect(reglage).toHaveTextContent('Réglée « Studios meublés » (anciennement « Studios »)');
  });

  it('les propositions écartées disent pourquoi, par leur libellé, jamais par leur code', async () => {
    rendre();

    const carte = await screen.findByTestId('radar-revision-3');
    expect(carte).toHaveTextContent('3 propositions écartées');
    const [protegee, plafond, inconnue] = within(carte).getAllByTestId('radar-revision-3-ecartee');
    // Revue du 2026-11-04 — la cible visée se nomme (`target_name`), plus par son numéro.
    expect(protegee).toHaveTextContent('Retirée « Bureaux du Plateau » — cible de l’opérateur, épinglée ou en pause : l’IA n’y touche pas.');
    expect(protegee).not.toHaveTextContent('cible n° 4');
    expect(within(protegee).getByRole('link')).toHaveAttribute('href', '/super-admin/radar/targets/4');
    expect(protegee).toHaveTextContent('Motif de l’IA : Plus demandée.');
    expect(plafond).toHaveTextContent('Créée « Tout Dakar » — plafond des cibles de la demande atteint (20 au plus).');
    expect(inconnue).toHaveTextContent('Proposition — écartée par la validation.');
    expect(carte).not.toHaveTextContent('radar.demand');
  });

  it('une révision défaite dit quand et par qui, et ne se défait plus', async () => {
    rendre();

    const carte = await screen.findByTestId('radar-revision-2');
    expect(within(carte).getByTestId('radar-revision-2-etat')).toHaveTextContent('Défaite');
    expect(within(carte).getByTestId('radar-revision-2-defaite')).toHaveTextContent(/Défaite le .+ par Awa N\./u);
    expect(carte).toHaveTextContent('L’IA n’a proposé aucun changement.');
    expect(within(carte).queryByTestId('radar-revision-2-defaire')).not.toBeInTheDocument();
  });

  it('« défaire » demande confirmation, puis relit l\'historique', async () => {
    vi.mocked(revertRadarTargetRevision).mockResolvedValue({ data: { ...REVISION, reverted_at: '2026-11-04T10:00:00+00:00', reverted_by_id: 7 } });
    const user = rendre();

    await user.click(await screen.findByTestId('radar-revision-3-defaire'));
    const dialogue = await screen.findByRole('dialog');
    expect(dialogue).toHaveTextContent(/une cible qu’elle a créée est retirée/u);
    expect(revertRadarTargetRevision).not.toHaveBeenCalled();

    await user.click(within(dialogue).getByTestId('radar-revision-defaire-confirmer'));
    expect(revertRadarTargetRevision).toHaveBeenCalledWith(3, expect.anything());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(fetchRadarTargetRevisions).toHaveBeenCalledTimes(2));
  });

  it('409 — une révision plus récente touche les mêmes cibles : l\'écran nomme laquelle', async () => {
    vi.mocked(revertRadarTargetRevision).mockRejectedValue(
      new ApiError(409, { message: 'x', code: 'radar.targets.revision_superseded', params: { revision_id: 5 } }),
    );
    const user = rendre();

    const dialogue = await ouvrirDefaire(user);
    const refus = await within(dialogue).findByTestId('radar-revision-refus');
    expect(refus).toHaveTextContent('Une révision plus récente (n° 5) touche les mêmes cibles : défaites-la d’abord.');
    expect(refus).not.toHaveTextContent('radar.targets');
    expect(within(dialogue).getByTestId('radar-revision-defaire-confirmer')).toBeDisabled();
  });

  it('409 — une cible touchée a changé depuis (épinglée, mise en pause ou retirée) : l\'écran la nomme', async () => {
    vi.mocked(revertRadarTargetRevision).mockRejectedValue(
      new ApiError(409, { message: 'x', code: 'radar.targets.revision_superseded', params: { target_id: 9 } }),
    );
    const user = rendre();

    const dialogue = await ouvrirDefaire(user);
    expect(await within(dialogue).findByTestId('radar-revision-refus'))
      .toHaveTextContent('« Terrains Diamniadio » a changé depuis cette révision (épinglée, mise en pause ou retirée) : la défaire effacerait ce geste. Réglez-la à la main.');
  });

  it.each([
    [new ApiError(409, { message: 'x', code: 'radar.targets.revision_reverted' }), 'Cette révision est déjà défaite.'],
    [new ApiError(404, { message: 'x' }), 'Cette révision n’existe plus.'],
    [new ApiError(422, { message: 'x', code: 'radar.targets.duplicate', params: { target_id: 12 } }), 'Une cible porte déjà exactement ces critères.'],
    // Revue du 2026-11-04 (D6) — défaire jugerait le plafond des cibles de la demande.
    [new ApiError(422, { message: 'x', code: 'radar.targets.too_many', params: { max: 20 } }), 'Défaire remettrait trop de cibles actives (20 au plus) : retirez-en ou mettez-en une en pause d’abord.'],
  ])('les autres refus de « défaire » se lisent en clair (%#)', async (erreur, libelle) => {
    vi.mocked(revertRadarTargetRevision).mockRejectedValue(erreur);
    const user = rendre();

    const dialogue = await ouvrirDefaire(user);
    expect(await within(dialogue).findByTestId('radar-revision-refus')).toHaveTextContent(libelle);
  });

  it('le support lit tout l\'historique, sans « défaire »', async () => {
    rendre(SUPPORT);

    const carte = await screen.findByTestId('radar-revision-3');
    expect(carte).toHaveTextContent('Retirée « Terrains Diamniadio »');
    expect(screen.getByText(/Seul le super-administrateur défait une révision/u)).toBeInTheDocument();
    expect(screen.queryByTestId('radar-revision-3-defaire')).not.toBeInTheDocument();
    expect(within(carte).queryAllByRole('button')).toHaveLength(0);
  });

  it('un retrait fait sans IA, faute de demande, le dit au lieu d\'un motif de l\'IA (revue du 2026-11-04, D7)', async () => {
    const sansIa: RadarTargetRevision = {
      ...DEFAITE,
      id: 4,
      operations: [{ op: 'retire', target_id: 9, merge_ids: [], name: null, criteria: null, reason: 'radar.demand.no_demand', signal_refs: [] }],
      before: [{ id: 9, name: 'Terrains Diamniadio', status: 'active', pinned: false, criteria: SANS_CRITERE, demand_count: 0 }],
      signals_count: 0,
      reverted_at: null,
      reverted_by_id: null,
      reverted_by: null,
    };
    vi.mocked(fetchRadarTargetRevisions).mockResolvedValue(page([sansIa]));
    rendre();

    const [retrait] = within(await screen.findByTestId('radar-revision-4')).getAllByTestId('radar-revision-4-op');
    expect(retrait).toHaveTextContent('Retirée « Terrains Diamniadio »');
    expect(retrait).toHaveTextContent('Retirée sans appel à l’IA : plus aucune demande sur 30 jours.');
    expect(retrait).not.toHaveTextContent('Motif de l’IA');
    expect(retrait).not.toHaveTextContent('radar.demand');
  });

  it('une proposition sans lien avec les demandes citées se lit en clair (revue du 2026-11-04, D3)', async () => {
    vi.mocked(fetchRadarTargetRevisions).mockResolvedValue(page([{
      ...REVISION,
      discarded: [{ op: 'create', target_id: null, merge_ids: [], name: 'Tout meublé', reason: 'Large.', code: 'radar.demand.uncovered', params: { signal_refs: [] } }],
    }]));
    rendre();

    const [ecartee] = within(await screen.findByTestId('radar-revision-3')).getAllByTestId('radar-revision-3-ecartee');
    expect(ecartee).toHaveTextContent('Créée « Tout meublé » — ses critères ne couvrent aucune des demandes qu’elle cite.');
  });

  it('sans révision : l\'écran dit d\'où elles viennent', async () => {
    vi.mocked(fetchRadarTargetRevisions).mockResolvedValue(page([]));
    rendre();

    expect(await screen.findByText('Aucune révision pour l’instant')).toBeInTheDocument();
  });
});
