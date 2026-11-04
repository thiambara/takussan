import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { fetchRadarDemand, refreshRadarDemand, setRadarDemandEnabled } from '@/lib/queries/radar';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarDemandSetting } from '@/types/radar';
import { EncartDemande } from '../EncartDemande';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchRadarDemand: vi.fn(),
  setRadarDemandEnabled: vi.fn(),
  refreshRadarDemand: vi.fn(),
}));

const SUPPORT: PlatformAbilities = { level: 'support', abilities: ['platform.console.access', 'platform.radar.operate'] };

const ETEINTE: RadarDemandSetting = {
  enabled: false,
  operator: null,
  enabled_at: null,
  blocked_reason: 'radar.demand.disabled',
  last_run_at: null,
  last_run_outcome: null,
  last_revision_at: null,
};

const ALLUMEE: RadarDemandSetting = {
  enabled: true,
  operator: { id: 7, name: 'Awa N.' },
  enabled_at: '2026-11-04T15:19:10+00:00',
  blocked_reason: null,
  last_run_at: '2026-11-04T03:40:02+00:00',
  last_run_outcome: 'applied',
  last_revision_at: '2026-11-04T03:40:02+00:00',
};

const reponse = (data: RadarDemandSetting) => ({ data });

function rendre(gestes?: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<EncartDemande />, gestes)}</QueryClientProvider>));
  return userEvent.setup();
}

beforeEach(() => {
  vi.mocked(fetchRadarDemand).mockReset().mockResolvedValue(reponse(ALLUMEE));
  vi.mocked(setRadarDemandEnabled).mockReset();
  vi.mocked(refreshRadarDemand).mockReset();
});

describe('L\'encart « Demande » (TCK-2470)', () => {
  it('éteinte : l\'écran dit que rien ne part, et qu\'allumer fait de vous l\'opérateur — avant le geste', async () => {
    vi.mocked(fetchRadarDemand).mockResolvedValue(reponse(ETEINTE));
    vi.mocked(setRadarDemandEnabled).mockResolvedValue(reponse({ ...ALLUMEE, last_run_at: null, last_run_outcome: null, last_revision_at: null }));
    const user = rendre();

    const encart = await screen.findByTestId('radar-demande');
    expect(within(encart).getByTestId('radar-demande-etat')).toHaveTextContent('Éteinte');
    expect(within(encart).getByTestId('radar-demande-operateur')).toHaveTextContent('Aucun opérateur');
    expect(within(encart).getByTestId('radar-demande-bloquee')).toHaveTextContent(/aucun passage ne part/u);
    expect(within(encart).getByTestId('radar-demande-dernier-passage')).toHaveTextContent('Aucun pour l’instant');
    // Rien à rafraîchir tant qu'elle est éteinte.
    expect(within(encart).queryByTestId('radar-demande-rafraichir')).not.toBeInTheDocument();

    const allumer = within(encart).getByTestId('radar-demande-bascule');
    expect(allumer).toHaveTextContent('Allumer');
    expect(allumer).toHaveAccessibleDescription(/vous en fait l’opérateur/u);

    await user.click(allumer);
    expect(setRadarDemandEnabled).toHaveBeenCalledWith(true, expect.anything());
    await waitFor(() => expect(within(encart).getByTestId('radar-demande-etat')).toHaveTextContent('Allumée'));
    expect(within(encart).getByTestId('radar-demande-operateur')).toHaveTextContent(/Au nom de Awa N\., depuis le/u);
    expect(within(encart).queryByTestId('radar-demande-aide')).not.toBeInTheDocument();
    expect(within(encart).getByTestId('radar-demande-bascule')).toHaveTextContent('Éteindre');
  });

  it('allumée : opérateur, dernier passage et son issue, dernière révision et le chemin vers l\'historique', async () => {
    rendre();

    const encart = await screen.findByTestId('radar-demande');
    expect(within(encart).getByTestId('radar-demande-etat')).toHaveTextContent('Allumée');
    expect(within(encart).getByTestId('radar-demande-operateur')).toHaveTextContent('Au nom de Awa N.');
    expect(within(encart).getByTestId('radar-demande-dernier-passage')).toHaveTextContent('Les cibles ont été revues par l’IA.');
    expect(within(encart).getByTestId('radar-demande-historique')).toHaveAttribute('href', '/super-admin/radar/targets/revisions');
    expect(within(encart).queryByTestId('radar-demande-bloquee')).not.toBeInTheDocument();
  });

  it.each([
    ['unchanged', 'l’IA n’a pas été appelée'],
    ['no_signals', 'Aucune recherche sans résultat'],
    ['radar.demand.invalid_output', 'illisible'],
    ['ai.budget', 'Le plafond de dépense IA du jour est atteint.'],
    ['ai.kill_switch', 'L’IA est coupée pour cet usage'],
    ['ai.code_inconnu', 'Le passage n’a pas abouti'],
    ['radar.demand.code_inconnu', 'Le passage n’a pas abouti'],
  ])('l\'issue « %s » se lit par son libellé, jamais par son code', async (code, libelle) => {
    vi.mocked(fetchRadarDemand).mockResolvedValue(reponse({ ...ALLUMEE, last_run_outcome: code }));
    rendre();

    const passage = await screen.findByTestId('radar-demande-dernier-passage');
    expect(passage).toHaveTextContent(libelle);
    expect(passage).not.toHaveTextContent(code);
  });

  it('« rafraîchir maintenant » lance un passage (202) et dit qu\'il est parti', async () => {
    vi.mocked(refreshRadarDemand).mockResolvedValue(reponse(ALLUMEE));
    const user = rendre();

    await user.click(await screen.findByTestId('radar-demande-rafraichir'));
    expect(refreshRadarDemand).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('radar-demande-lance')).toHaveTextContent('Passage lancé');
    // Pas de second passage pendant que le premier tourne.
    expect(screen.getByTestId('radar-demande-rafraichir')).toBeDisabled();
  });

  it('un 409 du rafraîchissement s\'explique, sans code brut, et l\'état est relu', async () => {
    vi.mocked(refreshRadarDemand).mockRejectedValue(new ApiError(409, { message: 'x', code: 'radar.demand.operator_missing' }));
    const user = rendre();

    await user.click(await screen.findByTestId('radar-demande-rafraichir'));
    const erreur = await screen.findByTestId('radar-demande-erreur');
    expect(erreur).toHaveTextContent(/son opérateur n’a plus accès au Radar/u);
    expect(erreur).not.toHaveTextContent('radar.demand');
    await waitFor(() => expect(fetchRadarDemand).toHaveBeenCalledTimes(2));
  });

  it('allumée mais sans opérateur : rien ne part, l\'écran le dit, et le super-administrateur la reprend en son nom', async () => {
    vi.mocked(fetchRadarDemand).mockResolvedValue(reponse({ ...ALLUMEE, operator: null, blocked_reason: 'radar.demand.operator_missing' }));
    vi.mocked(setRadarDemandEnabled).mockResolvedValue(reponse(ALLUMEE));
    const user = rendre();

    const encart = await screen.findByTestId('radar-demande');
    expect(within(encart).getByTestId('radar-demande-bloquee')).toHaveTextContent(/aucun passage ne part tant qu’un super-administrateur ne la reprend pas/u);
    expect(within(encart).queryByTestId('radar-demande-rafraichir')).not.toBeInTheDocument();
    const reprendre = within(encart).getByTestId('radar-demande-reprendre');
    expect(reprendre).toHaveAccessibleDescription(/La reprendre vous en fait l’opérateur/u);

    await user.click(reprendre);
    expect(setRadarDemandEnabled).toHaveBeenCalledWith(true, expect.anything());
    await waitFor(() => expect(within(encart).queryByTestId('radar-demande-bloquee')).not.toBeInTheDocument());
  });

  it('le support lit l\'état et le dernier passage, sans aucun geste', async () => {
    vi.mocked(fetchRadarDemand).mockResolvedValue(reponse({ ...ALLUMEE, operator: null, blocked_reason: 'radar.demand.operator_missing' }));
    rendre(SUPPORT);

    const encart = await screen.findByTestId('radar-demande');
    expect(within(encart).getByTestId('radar-demande-bloquee')).toBeInTheDocument();
    expect(within(encart).getByText('Seul le super-administrateur allume, éteint ou rafraîchit la demande.')).toBeInTheDocument();
    expect(within(encart).queryByTestId('radar-demande-gestes')).not.toBeInTheDocument();
    expect(within(encart).queryAllByRole('button')).toHaveLength(0);
    expect(within(encart).queryByTestId('radar-demande-aide')).not.toBeInTheDocument();
  });
});
