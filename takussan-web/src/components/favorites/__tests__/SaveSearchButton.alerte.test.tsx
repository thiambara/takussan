/**
 * TCK-599 — **AC15** (C6, honnêteté) et la saisie sans compte (V13).
 *
 * - Case NON cochée : charge utile `off`, et une confirmation qui ne promet aucune alerte.
 * - Case cochée : `daily`, et une confirmation qui le dit avec les canaux que l'API rend
 *   (`alert_channels`) — pas ceux que le front supposerait.
 * - Visiteur : plus de redirection forcée vers la connexion ; le formulaire « Me prévenir »
 *   envoie le contact, la langue et le consentement, et rien ne part sans la case cochée.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { SaveSearchButton } from '../SaveSearchButton';

const etat = vi.hoisted(() => ({ user: { id: 1 } as { id: number } | null }));
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/fr/properties',
  useSearchParams: () => new URLSearchParams('city=Dakar'),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: etat.user, token: etat.user ? 'jeton' : null, isLoading: false }),
}));

const mutateAsync = vi.fn();
vi.mock('@/lib/queries/saved-searches', () => ({
  useCreateSavedSearchMutation: () => ({ mutateAsync, isPending: false }),
}));

const S = fr.search.saveSearch;
const P = fr.search.publicAlert;

let appels: { url: string; method: string; body: unknown }[] = [];

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('<SaveSearchButton> — TCK-599', () => {
  beforeEach(() => {
    push.mockReset();
    mutateAsync.mockReset();
    appels = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        appels.push({
          url: String(url),
          method: init?.method ?? 'GET',
          body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
        });
        if (String(url).endsWith('/capabilities')) {
          return new Response(JSON.stringify({ data: { channels: ['email'] } }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: { status: 'pending_confirmation' } }), { status: 202 });
      }),
    );
  });

  it('AC15 — case non cochée : `off`, et la confirmation ne promet aucune alerte', async () => {
    etat.user = { id: 1 };
    mutateAsync.mockResolvedValue({ data: { id: 5, alert_channels: [] } });
    const user = userEvent.setup();
    render(wrap(<SaveSearchButton filters={{ city: 'Dakar' }} activeCount={1} />));

    await user.click(screen.getByRole('button', { name: S.trigger }));
    expect(screen.getByRole('checkbox', { name: new RegExp(S.alsoAlert) })).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: S.save }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ notification_frequency: 'off' }));
    expect(await screen.findByText(S.savedFull)).toBeInTheDocument();
    expect(screen.queryByText(/alerte/i)).toBeNull();
  });

  it('AC15 — case cochée : `daily`, et la confirmation nomme les canaux rendus par l’API', async () => {
    etat.user = { id: 1 };
    mutateAsync.mockResolvedValue({ data: { id: 6, alert_channels: ['inapp', 'email'] } });
    const user = userEvent.setup();
    render(wrap(<SaveSearchButton filters={{ city: 'Dakar' }} activeCount={1} />));

    await user.click(screen.getByRole('button', { name: S.trigger }));
    await user.click(screen.getByRole('checkbox', { name: new RegExp(S.alsoAlert) }));
    await user.click(screen.getByRole('button', { name: S.save }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ notification_frequency: 'daily' }));
    const attendu = S.savedWithAlert.replace(
      '{channels}',
      `${fr.search.alertChannels.inapp}, ${fr.search.alertChannels.email}`,
    );
    expect(await screen.findByText(attendu)).toBeInTheDocument();
  });

  it('visiteur : le formulaire sans compte envoie contact, langue et consentement — jamais sans la case', async () => {
    etat.user = null;
    const user = userEvent.setup();
    render(wrap(<SaveSearchButton filters={{ city: 'Dakar' }} activeCount={1} />));

    await user.click(screen.getByRole('button', { name: S.trigger }));
    expect(push).not.toHaveBeenCalled();
    expect(await screen.findByText(P.dialogTitle)).toBeInTheDocument();

    await user.type(screen.getByLabelText(P.emailLabel), 'awa@exemple.sn');
    await user.click(screen.getByRole('button', { name: P.submit }));
    expect(await screen.findByText(P.consentRequired)).toBeInTheDocument();
    expect(appels.filter((a) => a.method === 'POST')).toHaveLength(0);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: P.submit }));

    await waitFor(() => expect(appels.some((a) => a.method === 'POST')).toBe(true));
    const post = appels.find((a) => a.method === 'POST')!;
    expect(post.url).toMatch(/\/api\/public\/search-alerts$/);
    expect(post.body).toEqual({
      criteria: { city: 'Dakar' },
      name: 'Dakar',
      frequency: 'daily',
      channel: 'email',
      email: 'awa@exemple.sn',
      locale: 'fr',
      consent: true,
    });
    expect(await screen.findByText(P.sentEmailTitle)).toBeInTheDocument();
  });
});
