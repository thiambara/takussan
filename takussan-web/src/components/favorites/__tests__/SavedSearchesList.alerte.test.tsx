/**
 * TCK-599 — **AC15**, versant `/app/saved-searches` : chaque ligne montre l'état de son alerte,
 * se règle en place par `PATCH { notification_frequency }`, et nomme les canaux EFFECTIFS que
 * l'API rend (`alert_channels`) — une alerte coupée ne promet rien.
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
const C = fr.search.alertChannels;

const RECHERCHES = [
  { id: 7, user_id: 1, name: 'Dakar', criteria: { city: 'Dakar' }, notification_frequency: 'daily', is_active: true, results_count: 0, alert_channels: ['inapp'], created_at: null },
  { id: 8, user_id: 1, name: 'Thiès', criteria: { city: 'Thiès' }, notification_frequency: 'off', is_active: true, results_count: 0, alert_channels: [], created_at: null },
];

let appels: { url: string; method: string; body: unknown }[] = [];

describe('<SavedSearchesList> — TCK-599 AC15', () => {
  beforeEach(() => {
    appels = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({
          url: String(url),
          method: init?.method ?? 'GET',
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        });
        if (init?.method === 'PATCH') return new Response(JSON.stringify({ data: RECHERCHES[0] }), { status: 200 });
        return new Response(JSON.stringify({ data: RECHERCHES }), { status: 200 });
      }),
    );
  });

  function monte() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(withIntl(<QueryClientProvider client={client}>{<SavedSearchesList />}</QueryClientProvider>));
  }

  it('montre l’état et les canaux effectifs de chaque alerte', async () => {
    monte();
    const groupes = await screen.findAllByRole('group');
    expect(within(groupes[0]).getByRole('button', { name: T.frequency.daily })).toHaveAttribute('aria-pressed', 'true');
    expect(within(groupes[1]).getByRole('button', { name: T.frequency.off })).toHaveAttribute('aria-pressed', 'true');

    const lignes = screen.getAllByTestId('alert-channels');
    // L'e-mail coupé par la préférence : la ligne ne le promet pas.
    expect(lignes[0]).toHaveTextContent(T.alertChannels.replace('{channels}', C.inapp));
    expect(lignes[0]).not.toHaveTextContent(C.email);
    expect(lignes[1]).toHaveTextContent(T.alertOff);
  });

  it('régler une ligne envoie PATCH { notification_frequency } sur CETTE recherche', async () => {
    const user = userEvent.setup();
    monte();
    const groupes = await screen.findAllByRole('group');

    await user.click(within(groupes[1]).getByRole('button', { name: T.frequency.weekly }));

    await waitFor(() => expect(appels.some((a) => a.method === 'PATCH')).toBe(true));
    const patch = appels.find((a) => a.method === 'PATCH')!;
    expect(patch.url).toMatch(/\/api\/saved-searches\/8$/);
    expect(patch.body).toEqual({ notification_frequency: 'weekly' });
  });
});
