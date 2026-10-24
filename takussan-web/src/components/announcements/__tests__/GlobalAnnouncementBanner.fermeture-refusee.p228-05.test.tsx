/**
 * P228.05 (TCK-2218) — la fermeture d'une annonce, refusée par l'API, se dit dans le bandeau par
 * `useMessageErreurApi()` (ADR-0019). Avant, le bandeau restait en place sans un mot.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import { GlobalAnnouncementBanner } from '../GlobalAnnouncementBanner';

const MESSAGE_API = 'Service indisponible.';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, roles: ['owner'] }, token: 't', isLoading: false }),
}));

const { dismissAnnouncement } = vi.hoisted(() => ({ dismissAnnouncement: vi.fn() }));
vi.mock('@/lib/queries/announcements', async (original) => ({
  ...(await original<typeof import('@/lib/queries/announcements')>()),
  fetchActiveAnnouncements: async () => ({
    data: [{
      id: 4,
      title: { fr: 'Nouvelle grille', en: 'New pricing', wo: 'Nouvelle grille' },
      body: { fr: 'À venir', en: 'Coming', wo: 'À venir' },
      severity: 'info',
      segment: {},
      starts_at: '2026-08-01T08:00:00.000000Z',
      ends_at: null,
      is_active: true,
      created_by: 1,
      created_at: '2026-08-01T08:00:00.000000Z',
      updated_at: '2026-08-01T08:00:00.000000Z',
    }],
    meta: { total: 1, current_page: 1, last_page: 1, per_page: 30 },
  }),
  dismissAnnouncement,
}));

describe('<GlobalAnnouncementBanner> — la fermeture refusée se dit (P228.05)', () => {
  it('un refus de l’API affiche son message dans le bandeau', async () => {
    dismissAnnouncement.mockRejectedValue(new ApiError(503, { message: MESSAGE_API }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <GlobalAnnouncementBanner />
      </QueryClientProvider>,
    ));

    await userEvent.click(await screen.findByRole('button', { name: fr.announcements.dismissAria }));

    expect(dismissAnnouncement).toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });
});
