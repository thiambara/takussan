/**
 * P210.03 (TCK-2084) — une suppression de recherche sauvegardée qui échoue se dit sur sa ligne,
 * par `useMessageErreurApi()` (ADR-0019). Avant, `handleDelete` attendait `mutateAsync` en
 * `try … finally` sans `catch` : la ligne restait à l'écran sans un mot, et le rejet sortait
 * non rattrapé.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { SavedSearchesList } from '../SavedSearchesList';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

const T = fr.search.saved;
const MESSAGE_API = 'Suppression impossible pour le moment';

const RECHERCHES = [
  { id: 7, user_id: 1, name: 'Dakar', criteria: { city: 'Dakar' }, notification_frequency: 'daily', is_active: true, results_count: 0, alert_channels: ['inapp'], created_at: null },
  { id: 8, user_id: 1, name: 'Thiès', criteria: { city: 'Thiès' }, notification_frequency: 'off', is_active: true, results_count: 0, alert_channels: [], created_at: null },
];

let suppressions: string[] = [];
let reponseSuppression: () => Response;

describe('<SavedSearchesList> — la suppression refusée se dit (P210.03)', () => {
  beforeEach(() => {
    suppressions = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'DELETE') {
          suppressions.push(String(url));
          return reponseSuppression();
        }
        return new Response(JSON.stringify({ data: RECHERCHES }), { status: 200 });
      }),
    );
  });

  function monte() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(withIntl(<QueryClientProvider client={client}>{<SavedSearchesList />}</QueryClientProvider>));
  }

  function ligne(nom: string): HTMLElement {
    return screen.getByRole('heading', { name: nom }).closest('article') as HTMLElement;
  }

  it('un refus de l’API affiche son message sur la ligne, qui reste affichée', async () => {
    reponseSuppression = () => new Response(JSON.stringify({ message: MESSAGE_API }), { status: 500 });
    const user = userEvent.setup();
    monte();

    await user.click(await screen.findByRole('button', { name: T.deleteAria.replace('{name}', 'Dakar') }));

    await waitFor(() => expect(suppressions).toHaveLength(1));
    expect(await within(ligne('Dakar')).findByRole('alert')).toHaveTextContent(MESSAGE_API);
    expect(within(ligne('Thiès')).queryByRole('alert')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Dakar' })).toBeInTheDocument();
  });

  it('un nouvel essai efface le message de la ligne', async () => {
    const reponses = [
      () => new Response(JSON.stringify({ message: MESSAGE_API }), { status: 500 }),
      () => new Response(null, { status: 204 }),
    ];
    reponseSuppression = () => reponses.shift()!();
    const user = userEvent.setup();
    monte();

    const bouton = await screen.findByRole('button', { name: T.deleteAria.replace('{name}', 'Dakar') });
    await user.click(bouton);
    expect(await within(ligne('Dakar')).findByRole('alert')).toHaveTextContent(MESSAGE_API);

    await user.click(bouton);
    await waitFor(() => expect(suppressions).toHaveLength(2));
    await waitFor(() => expect(within(ligne('Dakar')).queryByRole('alert')).toBeNull());
  });
});
