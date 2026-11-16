/**
 * TCK-617 AC5 — l'agent de plusieurs agences qui n'a pas choisi d'espace reçoit 403
 * `calendar.feed_agency_required` : la feuille lui dit de choisir l'agence, avec le texte du front.
 * Un autre refus garde la prose de l'API.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import type { CalendarFeedState } from '@/types/agent-crm';
import { CalendarSubscription } from '../CalendarSubscription';

const api = vi.hoisted(() => ({
  fetchCalendarFeed: vi.fn<() => Promise<CalendarFeedState>>(),
  issueCalendarFeed: vi.fn<() => Promise<CalendarFeedState>>(),
  revokeCalendarFeed: vi.fn(async () => undefined),
}));
vi.mock('@/lib/queries/agent-crm', () => ({
  AGENT_CRM_QUERY_KEY: { calendarFeed: () => ['agent-crm', 'calendar-feed'] },
  ...api,
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><CalendarSubscription /></QueryClientProvider>));
}

beforeEach(() => {
  api.fetchCalendarFeed.mockReset().mockResolvedValue({ active: false });
  api.issueCalendarFeed.mockReset();
});

describe('CalendarSubscription — agence à choisir (TCK-617)', () => {
  it('dit de choisir l’agence quand l’API rend calendar.feed_agency_required', async () => {
    api.issueCalendarFeed.mockRejectedValue(new ApiError(403, { code: 'calendar.feed_agency_required', message: 'prose serveur' }));
    const user = userEvent.setup();
    monte();

    await user.click(await screen.findByRole('button', { name: 'Créer mon lien' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Choisissez d'abord l'agence de ce lien : vous travaillez pour plusieurs agences.");
  });

  it('garde la prose de l’API pour un autre refus', async () => {
    api.issueCalendarFeed.mockRejectedValue(new ApiError(403, { code: 'calendar.feed_not_staff', message: 'Réservé au personnel.' }));
    const user = userEvent.setup();
    monte();

    await user.click(await screen.findByRole('button', { name: 'Créer mon lien' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Réservé au personnel.');
  });
});
