/**
 * TCK-2597, AC5 — l'abonnement iCal, déplacé dans une feuille de l'agenda, se crée, se copie et se
 * révoque comme avant (TCK-591 §6) : la feuille porte le titre, la section garde son nom accessible.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { CalendarSubscription } from '../CalendarSubscription';

const api = vi.hoisted(() => ({
  fetchCalendarFeed: vi.fn(async () => ({ active: false })),
  issueCalendarFeed: vi.fn(async () => ({ active: true, url: 'https://api.test/ical/secret.ics' })),
  revokeCalendarFeed: vi.fn(async () => undefined),
}));
vi.mock('@/lib/queries/agent-crm', () => ({
  AGENT_CRM_QUERY_KEY: { calendarFeed: () => ['agent-crm', 'calendar-feed'] },
  ...api,
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

function monte() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><CalendarSubscription /></QueryClientProvider>));
}

describe('CalendarSubscription en feuille (TCK-2597)', () => {
  it('crée le lien, le montre une fois, le copie, puis le désactive', async () => {
    // `userEvent.setup()` pose son presse-papiers : on y relit ce que « Copier » a écrit.
    const user = userEvent.setup();
    monte();

    expect(screen.getByRole('region', { name: 'S\'abonner depuis un autre agenda' })).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Créer mon lien' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Créer mon lien' }));
    expect(await screen.findByRole('textbox', { name: 'Votre lien privé' })).toHaveValue('https://api.test/ical/secret.ics');
    expect(screen.getByRole('link', { name: 'Ajouter à Apple Calendrier' })).toHaveAttribute('href', 'webcal://api.test/ical/secret.ics');
    expect(screen.getByRole('link', { name: 'Ajouter à Google Agenda' })).toHaveAttribute('href', expect.stringContaining(encodeURIComponent('webcal://api.test/ical/secret.ics')));

    await user.click(screen.getByRole('button', { name: 'Copier' }));
    expect(await screen.findByRole('button', { name: 'Copié' })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe('https://api.test/ical/secret.ics');

    await user.click(screen.getByRole('button', { name: /^Révoquer le lien/ }));
    await waitFor(() => expect(api.revokeCalendarFeed).toHaveBeenCalledWith('jeton'));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Votre lien privé' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Créer mon lien' })).toBeInTheDocument();
  });
});
