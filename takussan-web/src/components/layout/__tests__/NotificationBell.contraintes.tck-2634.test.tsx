import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

import { NotificationBell } from '../NotificationBell';

/**
 * TCK-2634 (vérification, M4 et M5) — deux contraintes de non-régression du ticket que rien
 * n'épinglait : la cloche se relit toutes les 30 s, pas plus souvent (chaque relecture est un
 * appel à l'API pour chaque onglet ouvert), et sa pastille plafonne à « 9+ ».
 */

const getNotificationsMock = vi.fn();
vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: () => getNotificationsMock(),
  markNotificationReadAction: vi.fn(),
  markNotificationUnreadAction: vi.fn(),
  markNotificationsReadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));

const reponse = (unread: number) => ({ ok: true, data: { data: [], meta: { total: unread, unread, current_page: 1 } } });

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><NotificationBell /></QueryClientProvider>));
}

beforeEach(() => getNotificationsMock.mockReset());
afterEach(() => vi.useRealTimers());

describe('<NotificationBell> — les contraintes de TCK-2634', () => {
  it('la pastille plafonne à « 9+ » au-delà de 9 non lues', async () => {
    getNotificationsMock.mockResolvedValue(reponse(12));
    monter();
    await waitFor(() => expect(screen.getByText('9+')).toBeInTheDocument());
    expect(screen.queryByText('12')).not.toBeInTheDocument();
  });

  it('à 9 non lues, le compte exact', async () => {
    getNotificationsMock.mockResolvedValue(reponse(9));
    monter();
    await waitFor(() => expect(screen.getByText('9')).toBeInTheDocument());
    expect(screen.queryByText('9+')).not.toBeInTheDocument();
  });

  it('se relit toutes les 30 s, pas avant', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    getNotificationsMock.mockResolvedValue(reponse(1));
    monter();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const auMontage = getNotificationsMock.mock.calls.length;
    expect(auMontage).toBeGreaterThan(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(29_000);
    });
    expect(getNotificationsMock).toHaveBeenCalledTimes(auMontage);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(getNotificationsMock.mock.calls.length).toBeGreaterThan(auMontage);
  });
});
