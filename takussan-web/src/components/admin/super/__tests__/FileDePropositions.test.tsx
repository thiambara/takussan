import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  agirSurProposition,
  ciblesDeFusion,
  listerPropositions,
  type Proposition,
} from '@/lib/queries/super-admin-propositions';
import { withIntl } from '@/test/intl';
import { FileDePropositions } from '../FileDePropositions';

vi.mock('@/lib/queries/super-admin-propositions', () => ({
  listerPropositions: vi.fn(),
  ciblesDeFusion: vi.fn(),
  agirSurProposition: vi.fn(),
}));

/**
 * TCK-633 (AC5) — la file : une ligne par proposition en attente, quatre gestes, et la file
 * relue après chaque geste réussi.
 */
const LIBERTE_7: Proposition = { id: 7, name: 'Liberté 7', auteur: 'Awa Diop', usage: 2, lieu: 'Dakar · Dakar', villeId: 3, proches: [] };
const PAGE = { data: [LIBERTE_7], meta: { total: 1, per_page: 20, current_page: 1, last_page: 1 } };

function monter(genre: 'geo' | 'tags' = 'geo') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <FileDePropositions genre={genre} />
    </QueryClientProvider>,
  ));
}

async function ligne(nom = 'Liberté 7') {
  return screen.findByRole('listitem', { name: nom });
}

describe('<FileDePropositions /> — TCK-633', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listerPropositions).mockResolvedValue(PAGE);
    vi.mocked(ciblesDeFusion).mockResolvedValue([{ value: '2', label: 'Liberté 6' }, { value: '5', label: 'Sacré-Cœur' }]);
    vi.mocked(agirSurProposition).mockResolvedValue(undefined);
  });

  it('liste les quartiers en attente : nom, lieu, auteur, nombre d’annonces', async () => {
    monter();

    const l = await ligne();
    expect(screen.getByRole('heading', { name: 'Quartiers proposés' })).toBeInTheDocument();
    expect(within(l).getByText('Dakar · Dakar · Proposé par Awa Diop · 2 annonces')).toBeInTheDocument();
    expect(listerPropositions).toHaveBeenCalledWith('geo', 1);
  });

  it('une proposition dit les quartiers approuvés proches de son nom (TCK-788)', async () => {
    vi.mocked(listerPropositions).mockResolvedValue({ ...PAGE, data: [{ ...LIBERTE_7, proches: ['Liberté 6', 'Liberte 7'] }] });
    monter();

    const l = await ligne();
    expect(within(l).getByText('Proche de : Liberté 6, Liberte 7')).toBeInTheDocument();
  });

  it('sans quartier proche, aucune mention', async () => {
    monter();

    const l = await ligne();
    expect(within(l).queryByText(/Proche de/)).not.toBeInTheDocument();
  });

  it('une file vide le dit, avec l’état vide du design system', async () => {
    vi.mocked(listerPropositions).mockResolvedValue({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } });
    monter('tags');

    expect(await screen.findByText('Aucune proposition en attente')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Équipements proposés' })).toBeInTheDocument();
    expect(listerPropositions).toHaveBeenCalledWith('tags', 1);
  });

  it('une file en erreur se relance', async () => {
    vi.mocked(listerPropositions).mockRejectedValueOnce(new Error('500'));
    const user = userEvent.setup();
    monter();

    expect(await screen.findByText('Erreur de chargement des propositions.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await ligne()).toBeInTheDocument();
  });

  it('approuver : un appel, puis la file est relue et la décision annoncée', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(within(await ligne()).getByRole('button', { name: 'Approuver' }));

    expect(agirSurProposition).toHaveBeenCalledWith('geo', 7, { type: 'approve' });
    expect(await screen.findByRole('status')).toHaveTextContent('Décision enregistrée.');
    await waitFor(() => expect(listerPropositions).toHaveBeenCalledTimes(2));
  });

  it('refuser', async () => {
    const user = userEvent.setup();
    monter();

    await user.click(within(await ligne()).getByRole('button', { name: 'Refuser' }));

    expect(agirSurProposition).toHaveBeenCalledWith('geo', 7, { type: 'reject' });
  });

  it('renommer : le nouveau nom, sans espaces autour ; inchangé, rien ne part', async () => {
    const user = userEvent.setup();
    monter();
    const l = await ligne();

    await user.click(within(l).getByRole('button', { name: 'Renommer' }));
    const champ = within(l).getByLabelText('Nouveau nom');
    expect(champ).toHaveValue('Liberté 7');
    expect(within(l).getByRole('button', { name: 'Valider' })).toBeDisabled();

    await user.clear(champ);
    await user.type(champ, '  Liberté 6 Extension ');
    await user.click(within(l).getByRole('button', { name: 'Valider' }));

    expect(agirSurProposition).toHaveBeenCalledWith('geo', 7, { type: 'rename', name: 'Liberté 6 Extension' });
    await waitFor(() => expect(within(l).queryByLabelText('Nouveau nom')).not.toBeInTheDocument());
  });

  it('fusionner : les cibles approuvées de la même ville, choisies dans la liste', async () => {
    const user = userEvent.setup();
    monter();
    const l = await ligne();

    await user.click(within(l).getByRole('button', { name: 'Fusionner' }));
    expect(ciblesDeFusion).toHaveBeenCalledWith('geo', 3);
    expect(within(l).getByRole('button', { name: 'Valider' })).toBeDisabled();

    await user.type(within(l).getByLabelText('Fusionner dans'), 'lib');
    await user.click(await screen.findByRole('option', { name: 'Liberté 6' }));
    await user.click(within(l).getByRole('button', { name: 'Valider' }));

    expect(agirSurProposition).toHaveBeenCalledWith('geo', 7, { type: 'merge', intoId: 2 });
  });

  it('un geste refusé par l’API est annoncé, et le formulaire reste ouvert', async () => {
    vi.mocked(agirSurProposition).mockRejectedValueOnce(new Error('422'));
    const user = userEvent.setup();
    monter();
    const l = await ligne();

    await user.click(within(l).getByRole('button', { name: 'Renommer' }));
    await user.type(within(l).getByLabelText('Nouveau nom'), ' bis');
    await user.click(within(l).getByRole('button', { name: 'Valider' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('La décision n’a pas pu être enregistrée.');
    expect(within(l).getByLabelText('Nouveau nom')).toHaveValue('Liberté 7 bis');
    expect(listerPropositions).toHaveBeenCalledTimes(1);
  });
});
