import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

import { NotificationsHistory } from '../NotificationsHistory';

const getNotificationsMock = vi.fn();
const markReadMock = vi.fn();
const markAllReadMock = vi.fn();

vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: (query: unknown) => getNotificationsMock(query),
  markNotificationReadAction: (id: number) => markReadMock(id),
  markNotificationUnreadAction: vi.fn(),
  markAllNotificationsReadAction: () => markAllReadMock(),
}));

function page(current: number, last: number, unread = 3) {
  return {
    ok: true,
    data: {
      data: [
        {
          id: current * 10,
          type: 'system',
          code: null,
          params: null,
          target: null,
          title: `Notification de la page ${current}`,
          body: null,
          is_read: false,
          read_at: null,
          created_at: '2026-10-06T08:00:00.000000Z',
        },
      ],
      meta: { total: last * 20, unread, current_page: current, last_page: last, per_page: 20 },
    },
  };
}

function renderHistory() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={client}><NotificationsHistory /></QueryClientProvider>));
}

describe('NotificationsHistory', () => {
  beforeEach(() => {
    getNotificationsMock.mockReset();
    markReadMock.mockReset();
    markAllReadMock.mockReset();
    getNotificationsMock.mockImplementation(async (query: { page: number }) => page(query.page, 3));
  });

  it('se pagine côté serveur', async () => {
    renderHistory();
    expect(await screen.findByText('Notification de la page 1')).toBeInTheDocument();
    expect(screen.getByText('Page 1 sur 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Suivante' }));

    expect(await screen.findByText('Notification de la page 2')).toBeInTheDocument();
    expect(getNotificationsMock).toHaveBeenLastCalledWith({ page: 2, perPage: 20, unread: false });
  });

  it('filtre les non lues côté serveur et revient à la première page', async () => {
    renderHistory();
    await screen.findByText('Notification de la page 1');
    await userEvent.click(screen.getByRole('button', { name: 'Suivante' }));
    await screen.findByText('Notification de la page 2');

    await userEvent.click(screen.getByRole('button', { name: 'Non lues (3)' }));

    await waitFor(() =>
      expect(getNotificationsMock).toHaveBeenLastCalledWith({ page: 1, perPage: 20, unread: true }),
    );
    expect(screen.getByRole('button', { name: 'Non lues (3)' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marque tout comme lu', async () => {
    markAllReadMock.mockResolvedValue({ ok: true, data: true });
    renderHistory();
    await screen.findByText('Notification de la page 1');

    await userEvent.click(screen.getByRole('button', { name: 'Tout marquer comme lu' }));

    await waitFor(() => expect(markAllReadMock).toHaveBeenCalledTimes(1));
  });

  it('un historique vide le dit', async () => {
    getNotificationsMock.mockResolvedValue({
      ok: true,
      data: { data: [], meta: { total: 0, unread: 0, current_page: 1, last_page: 1, per_page: 20 } },
    });
    renderHistory();

    expect(await screen.findByText('Aucune notification pour l’instant.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
