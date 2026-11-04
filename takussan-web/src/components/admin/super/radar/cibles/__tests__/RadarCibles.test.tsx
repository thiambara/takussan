import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { createRadarTarget, fetchRadarTargets } from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarTarget, RadarTargetCriteria } from '@/types/radar';
import { RadarCibles } from '../RadarCibles';

vi.mock('next/navigation', async (original) => ({
  ...(await original<typeof import('next/navigation')>()),
  usePathname: () => '/super-admin/radar/targets',
}));

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRadarDashboard: vi.fn(async () => ({ data: { follow_ups_due: 0 } })),
  fetchRadarTargets: vi.fn(),
  createRadarTarget: vi.fn(),
}));

// Le référentiel public : deux villes, aucun appel réseau.
vi.mock('@/lib/queries/referentiel-public', () => ({
  useVillesDuReferentiel: () => ({
    data: { data: [{ id: 1, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: null, longitude: null }] },
    isLoading: false,
  }),
  useQuartiersDuReferentiel: () => ({ data: { data: [] }, isLoading: false }),
}));

const SUPPORT: PlatformAbilities = { level: 'support', abilities: ['platform.console.access', 'platform.radar.operate'] };

const SANS_CRITERE: RadarTargetCriteria = {
  cities: [], neighborhoods: [], types: [], contract: null, price_min: null, price_max: null,
  bedrooms_min: null, bedrooms_max: null, furnished: null, sites: [], max_age_days: null,
};

const F3: RadarTarget = {
  id: 12,
  name: 'F3 Almadies',
  origin: 'operator',
  status: 'active',
  pinned: false,
  criteria: { ...SANS_CRITERE, types: ['apartment'], contract: 'rent', neighborhoods: [{ name: 'Almadies', city: 'Dakar' }], price_max: 700000 },
  demand_count: null,
  matches_count: 4,
  last_matched_at: '2026-11-04T10:00:00+00:00',
  created_at: '2026-11-03T10:00:00+00:00',
};

const DEMANDE: RadarTarget = {
  ...F3,
  id: 13,
  name: 'Villas à vendre',
  origin: 'demand',
  status: 'paused',
  pinned: true,
  criteria: { ...SANS_CRITERE, types: ['villa'], contract: 'sale' },
  demand_count: 9,
  matches_count: 0,
  last_matched_at: null,
};

const page = (data: RadarTarget[]) => ({
  data,
  meta: { current_page: 1, last_page: 1, per_page: 25, total: data.length, from: 1, to: data.length },
}) as never;

function rendre(gestes?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<RadarCibles />, gestes)}</QueryClientProvider>));
  return userEvent.setup();
}

beforeEach(() => {
  vi.mocked(fetchRadarTargets).mockReset().mockResolvedValue(page([F3, DEMANDE]));
  vi.mocked(createRadarTarget).mockReset();
});

describe('Les cibles du Radar (TCK-2469)', () => {
  it('une ligne par cible : nom, résumé lisible, état, origine, épinglée, trouvées', async () => {
    rendre();

    const ligne = await screen.findByTestId('radar-cible-12');
    expect(within(ligne).getByRole('link', { name: 'F3 Almadies' })).toHaveAttribute('href', '/super-admin/radar/targets/12');
    expect(ligne).toHaveTextContent(/Appartement · location · Almadies · jusqu’à 700\s000\sF\sCFA/u);
    expect(ligne).toHaveTextContent('Active');
    expect(ligne).toHaveTextContent('Opérateur');
    expect(ligne).toHaveTextContent('4');

    const demande = screen.getByTestId('radar-cible-13');
    expect(demande).toHaveTextContent('En pause');
    expect(demande).toHaveTextContent('Demande');
    expect(within(demande).getByTestId('radar-cible-epinglee-13')).toHaveAccessibleName('Épinglée');
    // La liste est lue avec ses seules colonnes, triée côté serveur.
    expect(fetchRadarTargets).toHaveBeenCalledWith({ status: undefined, origin: undefined, page: 1, perPage: 25 });
  });

  it('AC1 — créer une cible l\'ajoute à la liste avec son résumé, l\'aperçu suivant la saisie', async () => {
    const creee: RadarTarget = {
      ...F3,
      id: 14,
      name: 'Studios meublés',
      criteria: { ...SANS_CRITERE, types: ['studio'], furnished: true },
      matches_count: 0,
      last_matched_at: null,
    };
    vi.mocked(createRadarTarget).mockResolvedValue({ data: creee });
    const user = rendre();

    await user.click(await screen.findByTestId('radar-cibles-creer'));
    const panneau = await screen.findByTestId('radar-cible-panneau');
    const apercu = within(panneau).getByTestId('radar-cible-apercu');
    expect(apercu).toHaveTextContent('Aucun critère pour l’instant');

    await user.type(within(panneau).getByLabelText('Nom'), 'Studios meublés');
    await user.click(within(panneau).getByRole('button', { name: 'Studio' }));
    const meuble = within(panneau).getByRole('group', { name: 'Meublé' });
    await user.click(within(meuble).getByRole('button', { name: 'Oui' }));
    expect(apercu).toHaveTextContent('Studio · meublé');

    vi.mocked(fetchRadarTargets).mockResolvedValue(page([creee, F3, DEMANDE]));
    await user.click(within(panneau).getByRole('button', { name: 'Créer la cible' }));

    await waitFor(() => expect(createRadarTarget).toHaveBeenCalledTimes(1));
    const envoi = vi.mocked(createRadarTarget).mock.calls[0][0];
    expect(envoi.name).toBe('Studios meublés');
    expect(envoi.criteria).toMatchObject({ types: ['studio'], furnished: true, contract: null, cities: [], price_min: null });
    expect(envoi).not.toHaveProperty('status');
    expect(envoi).not.toHaveProperty('origin');

    const nouvelle = await screen.findByTestId('radar-cible-14');
    expect(nouvelle).toHaveTextContent('Studio · meublé');
    await waitFor(() => expect(screen.queryByTestId('radar-cible-panneau')).toBeNull());
  });

  it.each([
    [{ code: 'radar.targets.invalid_range', params: { field: 'criteria.price_min' } }, '« Prix minimum » dépasse le maximum'],
    [{ code: 'radar.targets.too_many_items', params: { field: 'criteria.neighborhoods', max: 30 } }, 'Trop de valeurs pour « Quartiers » : 30 au plus.'],
    [{ code: 'radar.targets.too_many', params: { max: 50 } }, 'Trop de cibles actives : 50 au plus'],
    [{ code: 'radar.targets.empty_criteria' }, 'Choisissez au moins un critère'],
  ])('AC1 — une validation refusée affiche le libellé du code, jamais le code (%o)', async (refus, libelle) => {
    vi.mocked(createRadarTarget).mockRejectedValue(new ApiError(422, { message: 'x', ...refus }));
    const user = rendre();

    await user.click(await screen.findByTestId('radar-cibles-creer'));
    const panneau = await screen.findByTestId('radar-cible-panneau');
    await user.type(within(panneau).getByLabelText('Nom'), 'Essai');
    await user.click(within(panneau).getByRole('button', { name: 'Créer la cible' }));

    const zone = await within(panneau).findByTestId('radar-cible-refus');
    expect(zone).toHaveTextContent(libelle);
    expect(zone).not.toHaveTextContent(refus.code);
    // Le panneau reste ouvert : la saisie n'est pas perdue.
    expect(within(panneau).getByLabelText('Nom')).toHaveValue('Essai');
  });

  it('un doublon mène à la cible qui porte déjà ces critères', async () => {
    vi.mocked(createRadarTarget).mockRejectedValue(new ApiError(422, { code: 'radar.targets.duplicate', params: { target_id: 12 } }));
    const user = rendre();

    await user.click(await screen.findByTestId('radar-cibles-creer'));
    const panneau = await screen.findByTestId('radar-cible-panneau');
    await user.type(within(panneau).getByLabelText('Nom'), 'Doublon');
    await user.click(within(panneau).getByRole('button', { name: 'Créer la cible' }));

    const zone = await within(panneau).findByTestId('radar-cible-refus');
    expect(zone).toHaveTextContent('Une cible porte déjà exactement ces critères.');
    expect(within(zone).getByRole('link', { name: 'Voir la cible existante' })).toHaveAttribute('href', '/super-admin/radar/targets/12');
  });

  it('AC3 — le support voit toutes les cibles, sans aucun bouton d\'écriture', async () => {
    rendre(SUPPORT);

    await screen.findByTestId('radar-cible-12');
    expect(screen.getByTestId('radar-cible-13')).toBeInTheDocument();
    expect(screen.queryByTestId('radar-cibles-creer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nouvelle cible' })).toBeNull();
    expect(screen.getByText(/Seul le super-administrateur crée, règle ou retire une cible/)).toBeInTheDocument();
  });

  it('un opérateur sans le geste du Radar : un refus, aucun appel', () => {
    rendre({ level: 'viewer', abilities: ['platform.console.access'] } as PlatformAbilities);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(fetchRadarTargets).not.toHaveBeenCalled();
  });
});
