import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppTopbar } from '../AppTopbar';
import { NotificationBell } from '../NotificationBell';
import type { User } from '@/types/user';

const getNotificationsMock = vi.fn();
const markReadMock = vi.fn();
const markUnreadMock = vi.fn();
const markAllReadMock = vi.fn();

vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: () => getNotificationsMock(),
  markNotificationReadAction: (id: number) => markReadMock(id),
  markNotificationUnreadAction: (id: number) => markUnreadMock(id),
  markAllNotificationsReadAction: () => markAllReadMock(),
}));

vi.mock('@/components/profile/ProfileSwitcher', () => ({
  ProfileSwitcher: () => <span>Profil actif</span>,
}));

vi.mock('@/components/shared/LanguageSwitcher', () => ({
  LanguageSwitcher: () => <button type="button">Langue</button>,
}));

vi.mock('../UserMenu', () => ({
  UserMenu: () => <button type="button">Menu utilisateur</button>,
}));

vi.mock('@/components/search/SearchAutocomplete', () => ({
  SearchAutocomplete: () => <div>Recherche</div>,
}));

const user: User = {
  id: 1,
  first_name: 'Astou',
  last_name: 'Dieng',
  full_name: 'Astou Dieng',
  email: 'astou@example.com',
  phone: null,
  bio: null,
  avatar_url: null,
  email_verified_at: null,
  phone_verified_at: null,
  two_factor_enabled: false,
  roles: ['owner'],
  status: 'active',
  created_at: '2026-05-08T10:00:00.000000Z',
};

function response() {
  return {
    data: [
      {
        id: 1,
        type: 'system',
        title: 'Plus récente',
        body: 'Notification non lue',
        is_read: false,
        read_at: null,
        created_at: '2026-05-08T12:00:00.000000Z',
      },
      {
        id: 2,
        type: 'system',
        title: 'Plus ancienne',
        body: 'Notification lue',
        is_read: true,
        read_at: '2026-05-08T11:30:00.000000Z',
        created_at: '2026-05-08T11:00:00.000000Z',
      },
    ],
    meta: { total: 2, unread: 1, current_page: 1 },
  };
}

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

describe('<NotificationBell>', () => {
  beforeEach(() => {
    getNotificationsMock.mockReset();
    markReadMock.mockReset();
    markUnreadMock.mockReset();
    markAllReadMock.mockReset();
  });

  it('is visible from the authenticated topbar with the unread badge', async () => {
    getNotificationsMock.mockResolvedValue({ ok: true, data: response() });

    render(wrap(<AppTopbar user={user} />));

    expect(
      screen.getByRole('button', { name: 'Notifications' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });

  it('opens a date-sorted feed and marks one notification as read', async () => {
    const browserUser = userEvent.setup();
    getNotificationsMock.mockResolvedValue({ ok: true, data: response() });
    markReadMock.mockResolvedValue({
      ok: true,
      data: {
        ...response().data[0],
        is_read: true,
        read_at: '2026-05-08T12:05:00.000000Z',
      },
    });

    render(wrap(<NotificationBell />));
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());

    await browserUser.click(screen.getByRole('button', { name: 'Notifications' }));

    const feed = screen.getByRole('region', {
      name: 'Centre de notifications',
    });
    const items = within(feed).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Plus récente');
    expect(items[1]).toHaveTextContent('Plus ancienne');

    await browserUser.click(
      within(items[0]).getByRole('button', { name: 'Marquer lu' }),
    );

    await waitFor(() => expect(markReadMock).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.getByText('0 non lue')).toBeInTheDocument());
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });
});
