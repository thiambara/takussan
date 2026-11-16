/**
 * TCK-2848 (AC7) — la colonne « Familles » de l'historique (bureau, maquette `app-notifications` e1)
 * compte TOUTES les notifications de chaque famille, lues comprises (« Toutes 42 », « Demandes 3 ») :
 * `meta.counts.total` et `total_par_famille`, servis par TCK-2847. Lire une ligne, ou tout lire, ne
 * change pas ces totaux (les corrections du cache les gardent).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { NotificationsHistory } from '../NotificationsHistory';

const getNotificationsMock = vi.fn();
const markAllReadMock = vi.fn();
vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: (query: unknown) => getNotificationsMock(query),
  markNotificationReadAction: vi.fn(),
  markNotificationUnreadAction: vi.fn(),
  markAllNotificationsReadAction: () => markAllReadMock(),
}));

const reponse = {
  ok: true,
  data: {
    data: [
      {
        id: 1,
        type: 'system',
        code: null,
        params: null,
        target: null,
        title: 'Une demande',
        body: null,
        is_read: false,
        read_at: null,
        famille: 'demande',
        created_at: '2026-10-06T08:00:00.000000Z',
      },
    ],
    meta: {
      total: 1,
      unread: 2,
      current_page: 1,
      last_page: 1,
      per_page: 20,
      counts: {
        a_traiter_non_lues: 1,
        par_famille: { demande: 1, visite: 1 },
        total: 42,
        total_par_famille: { demande: 3, visite: 12, paiement: 27 },
      },
    },
  },
};

const colonne = () => within(screen.getByRole('navigation', { name: 'Familles' }));
const compteDe = (nom: RegExp) => colonne().getByRole('button', { name: nom }).textContent;

beforeEach(() => {
  getNotificationsMock.mockReset();
  getNotificationsMock.mockResolvedValue(reponse);
  markAllReadMock.mockReset();
});

describe('TCK-2848 — la colonne « Familles » compte le total par famille', () => {
  it('AC7 — « Toutes 42 », « Demandes 3 », « Visites 12 », une famille sans notification à 0', async () => {
    render(withIntl(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NotificationsHistory /></QueryClientProvider>));
    await screen.findByText('Une demande');
    expect(compteDe(/^Toutes/)).toBe('Toutes42');
    expect(compteDe(/^Demandes/)).toBe('Demandes3');
    expect(compteDe(/^Visites/)).toBe('Visites12');
    expect(compteDe(/^Avis/)).toBe('Avis0');
  });

  it('tout lire vide les non-lues, pas les totaux', async () => {
    markAllReadMock.mockResolvedValue({ ok: true, data: true });
    // La relecture après le geste ne doit pas suffire à rétablir les totaux : elle reste en attente.
    let relire: (v: unknown) => void = () => {};
    render(withIntl(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><NotificationsHistory /></QueryClientProvider>));
    await screen.findByText('Une demande');
    getNotificationsMock.mockImplementation(() => new Promise((r) => (relire = r)));
    await userEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));
    await waitFor(() => expect(markAllReadMock).toHaveBeenCalled());
    expect(compteDe(/^Toutes/)).toBe('Toutes42');
    expect(compteDe(/^Demandes/)).toBe('Demandes3');
    relire(reponse);
  });
});
