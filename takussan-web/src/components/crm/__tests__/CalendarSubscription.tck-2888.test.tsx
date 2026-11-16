/**
 * TCK-2888, AC4 — l'abonnement iCal rouvert : le lien relu (`GET /api/me/calendar-feed` rend `url`
 * depuis TCK-2887, ADR-0121), « Copier », « Ajouter à Google Agenda » et « Apple Calendrier ». Un lien
 * sans copie (`url: null`, émis avant TCK-2887) ou une clé absente (impersonation) gardent l'écran
 * d'avant : « Générer un nouveau lien ».
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { CalendarFeedState } from '@/types/agent-crm';
import { CalendarSubscription } from '../CalendarSubscription';

const api = vi.hoisted(() => ({
  fetchCalendarFeed: vi.fn<() => Promise<CalendarFeedState>>(),
  issueCalendarFeed: vi.fn(async () => ({ active: true, url: 'https://api.test/ical/neuf.ics' })),
  revokeCalendarFeed: vi.fn(async () => undefined),
}));
vi.mock('@/lib/queries/agent-crm', () => ({
  AGENT_CRM_QUERY_KEY: { calendarFeed: () => ['agent-crm', 'calendar-feed'] },
  ...api,
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const LIEN = 'https://api.test/calendar-feed/9f3c27a1e21.ics';

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><CalendarSubscription /></QueryClientProvider>));
}

beforeEach(() => {
  api.fetchCalendarFeed.mockReset();
  api.revokeCalendarFeed.mockClear();
});

describe('CalendarSubscription rouverte (TCK-2888)', () => {
  it('avec un lien relisible : le lien, « Copier » (qui le copie), Google et Apple ; pas de « Générer »', async () => {
    api.fetchCalendarFeed.mockResolvedValue({ active: true, created_at: '2026-11-03T09:00:00Z', last_accessed_at: null, url: LIEN });
    const user = userEvent.setup();
    monte();

    expect(await screen.findByRole('textbox', { name: 'Votre lien privé' })).toHaveValue(LIEN);
    expect(screen.getByRole('link', { name: 'Ajouter à Apple Calendrier' })).toHaveAttribute('href', 'webcal://api.test/calendar-feed/9f3c27a1e21.ics');
    expect(screen.getByRole('link', { name: 'Ajouter à Google Agenda' })).toHaveAttribute(
      'href',
      `https://calendar.google.com/calendar/r?cid=${encodeURIComponent('webcal://api.test/calendar-feed/9f3c27a1e21.ics')}`,
    );
    expect(screen.getByText('Qui a ce lien voit vos rendez-vous : ne le partagez pas.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Générer un nouveau lien' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copier' }));
    expect(await screen.findByRole('button', { name: 'Copié' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(LIEN);
  });

  it.each([
    ['nul (lien émis avant TCK-2887)', { active: true, created_at: '2026-11-03T09:00:00Z', url: null }],
    ['absent (impersonation)', { active: true, created_at: '2026-11-03T09:00:00Z' }],
  ])('sans lien relisible — url %s — l’écran d’avant : « Générer un nouveau lien »', async (_cas, etat: CalendarFeedState) => {
    api.fetchCalendarFeed.mockResolvedValue(etat);
    monte();

    expect(await screen.findByRole('button', { name: 'Générer un nouveau lien' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Votre lien privé' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ajouter à Google Agenda' })).not.toBeInTheDocument();
  });

  it('révoqué, le lien relu disparaît sans attendre la relecture', async () => {
    let lu: CalendarFeedState = { active: true, url: LIEN };
    api.fetchCalendarFeed.mockImplementation(async () => lu);
    // La relecture qui suit la révocation ne revient jamais : seul l'état posé à la révocation compte.
    api.revokeCalendarFeed.mockImplementation(async () => {
      lu = { active: false };
      api.fetchCalendarFeed.mockImplementation(() => new Promise(() => {}));
    });
    const user = userEvent.setup();
    monte();

    await screen.findByRole('textbox', { name: 'Votre lien privé' });
    await user.click(screen.getByRole('button', { name: /^Révoquer le lien/ }));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Votre lien privé' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Créer mon lien' })).toBeInTheDocument();
  });
});
