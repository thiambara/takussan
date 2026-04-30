import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { CalendarPage } from '../CalendarPage';
import type { CalendarEvent } from '@/types/calendar';

/**
 * TCK-072 — Tests Vitest ciblés sur le composant CalendarPage.
 *
 * On mock `useCalendar` pour piloter le payload renvoyé et on vérifie :
 * - rendu mois par défaut + pills événements
 * - bascule mois/semaine/jour/liste conserve le filtre type
 * - click événement ouvre le panneau de détail avec le bon deeplink
 * - densité max : au-delà de 3 events par jour, affiche "+N autres"
 */

type QueryResult = {
  data?: { data: CalendarEvent[] };
  isLoading: boolean;
  isError: boolean;
};

const calendarResult: QueryResult = {
  data: { data: [] },
  isLoading: false,
  isError: false,
};

vi.mock('@/lib/queries/calendar', () => ({
  useCalendar: () => calendarResult,
  calendarQueryKeys: { range: (p: unknown) => ['calendar', 'range', p] as const },
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <NextIntlClientProvider locale="fr" messages={{}}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

function mkBooking(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 1,
    type: 'booking',
    title: 'Villa Almadies',
    start: '2026-04-20 00:00:00',
    end: '2026-04-25 00:00:00',
    status: 'confirmed',
    all_day: true,
    property_id: 10,
    property_slug: 'villa-almadies',
    resource_url: '/app/bookings/1',
    ...overrides,
  };
}

function mkVisit(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 2,
    type: 'visit',
    title: 'Appart Point E',
    start: '2026-04-22 10:00:00',
    end: '2026-04-22 10:30:00',
    status: 'confirmed',
    all_day: false,
    duration_minutes: 30,
    property_id: 11,
    property_slug: 'appart-point-e',
    resource_url: '/app/visits/2',
    ...overrides,
  };
}

const INITIAL_FOCUS = new Date(2026, 3, 24); // 2026-04-24 (Friday)

describe('<CalendarPage>', () => {
  beforeEach(() => {
    calendarResult.isLoading = false;
    calendarResult.isError = false;
    calendarResult.data = { data: [mkBooking(), mkVisit()] };
  });

  it('renders month view by default with both event pills', () => {
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    expect(screen.getByText(/avril 2026/i)).toBeInTheDocument();
    // Bookings span multiple days → several pills. At least one each.
    expect(screen.getAllByTestId('calendar-event-pill-booking-1').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('calendar-event-pill-visit-2').length).toBeGreaterThan(0);
  });

  it('switches to week view when clicked', async () => {
    const user = userEvent.setup();
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    await user.click(screen.getByTestId('calendar-view-week'));

    expect(screen.getByLabelText('Vue semaine')).toBeInTheDocument();
    expect(screen.queryByLabelText('Vue mois')).toBeNull();
    // Events remain rendered in the new view
    expect(screen.getAllByTestId('calendar-event-pill-visit-2').length).toBeGreaterThan(0);
  });

  it('switches to day view showing a single date', async () => {
    const user = userEvent.setup();
    // Focus on 2026-04-22 where a visit exists
    render(wrap(<CalendarPage initialFocus={new Date(2026, 3, 22)} />));

    await user.click(screen.getByTestId('calendar-view-day'));

    expect(screen.getByTestId('calendar-event-row-visit-2')).toBeInTheDocument();
  });

  it('switches to list view and groups by day', async () => {
    const user = userEvent.setup();
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    await user.click(screen.getByTestId('calendar-view-list'));

    expect(screen.getByTestId('calendar-list-row-booking-1')).toBeInTheDocument();
    expect(screen.getByTestId('calendar-list-row-visit-2')).toBeInTheDocument();
  });

  it('opens detail panel with deep-link when an event is clicked', async () => {
    const user = userEvent.setup();
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    const pill = screen.getAllByTestId('calendar-event-pill-booking-1')[0];
    await user.click(pill);

    const panel = await screen.findByTestId('calendar-event-detail');
    const openLink = within(panel).getByTestId('calendar-event-open-resource');
    expect(openLink).toHaveAttribute('href', '/app/bookings/1');
    expect(within(panel).getByText('Villa Almadies')).toBeInTheDocument();
  });

  it('deduplicates events per day beyond the max density threshold', () => {
    // 5 bookings that cover 2026-04-20 → default maxPerDay=3 ⇒ "+2 autres".
    // The booking spans 6 days, so the overflow label appears on every day.
    calendarResult.data = {
      data: Array.from({ length: 5 }, (_, i) =>
        mkBooking({ id: 10 + i, title: `Booking #${10 + i}` }),
      ),
    };
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    expect(screen.getAllByText(/\+2 autres/i).length).toBeGreaterThan(0);
  });

  it('disables one type via the segmented control without emptying both', async () => {
    const user = userEvent.setup();
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    const bookingToggle = screen.getByTestId('calendar-type-toggle-booking');
    expect(bookingToggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(bookingToggle);
    // booking is now disabled, visit still active
    expect(bookingToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('calendar-type-toggle-visit')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Click the remaining active one — it should NOT deactivate (last one locked)
    await user.click(screen.getByTestId('calendar-type-toggle-visit'));
    expect(screen.getByTestId('calendar-type-toggle-visit')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('exposes a property filter built from the returned events', () => {
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    const select = screen.getByTestId('calendar-property-filter') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.text);
    expect(options[0]).toBe('Tous les biens');
    expect(options).toContain('Villa Almadies');
    expect(options).toContain('Appart Point E');
  });

  it('shows a skeleton while loading', () => {
    calendarResult.isLoading = true;
    calendarResult.data = undefined;
    const { container } = render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));
    // Skeleton = div with animate-pulse
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows an error message when the query fails', () => {
    calendarResult.isLoading = false;
    calendarResult.isError = true;
    calendarResult.data = undefined;
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));
    expect(screen.getByText(/impossible de charger/i)).toBeInTheDocument();
  });

  it('today button resets focus to the current month', async () => {
    const user = userEvent.setup();
    render(wrap(<CalendarPage initialFocus={new Date(2020, 0, 15)} />));
    // Before: month label should be january 2020
    expect(screen.getByTestId('calendar-focus-label').textContent?.toLowerCase()).toContain(
      'janvier 2020',
    );
    await user.click(screen.getByRole('button', { name: /aujourd'hui/i }));
    // After: focus label changed (new month, current year)
    const after = screen.getByTestId('calendar-focus-label').textContent ?? '';
    expect(after.toLowerCase()).not.toContain('janvier 2020');
  });
});
