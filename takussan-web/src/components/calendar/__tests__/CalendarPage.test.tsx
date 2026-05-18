import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
 * - densité max : au-delà de 2 events par jour, affiche "+N autres"
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

const { useCalendarMock } = vi.hoisted(() => ({
  useCalendarMock: vi.fn(),
}));

vi.mock('@/lib/queries/calendar', () => ({
  useCalendar: useCalendarMock,
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

function mkLease(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 3,
    type: 'lease',
    title: 'Bail Plateau',
    start: '2026-04-01 00:00:00',
    end: '2026-04-30 00:00:00',
    status: 'active',
    all_day: true,
    property_id: 12,
    property_slug: 'bail-plateau',
    resource_url: '/app/leases/3',
    ...overrides,
  };
}

const INITIAL_FOCUS = new Date(2026, 3, 24); // 2026-04-24 (Friday)

describe('<CalendarPage>', () => {
  beforeEach(() => {
    calendarResult.isLoading = false;
    calendarResult.isError = false;
    calendarResult.data = { data: [mkBooking(), mkVisit()] };
    useCalendarMock.mockClear();
    useCalendarMock.mockImplementation(() => calendarResult);
  });

  it('renders a permanent legend for bookings, visits and leases', () => {
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    const legend = screen.getByTestId('calendar-legend');
    expect(within(legend).getByText('Réservations')).toBeInTheDocument();
    expect(within(legend).getByText('Visites')).toBeInTheDocument();
    expect(within(legend).getByText('Baux')).toBeInTheDocument();
    expect(within(legend).getByText(/signature encore en attente/i)).toBeInTheDocument();
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
    // 5 bookings that cover 2026-04-20 → default maxPerDay=2 ⇒ "+3 autres".
    // The booking spans 6 days, so the overflow label appears on every day.
    calendarResult.data = {
      data: Array.from({ length: 5 }, (_, i) =>
        mkBooking({ id: 10 + i, title: `Booking #${10 + i}` }),
      ),
    };
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    expect(screen.getAllByText(/\+3 autres/i).length).toBeGreaterThan(0);
    expect(screen.getByTestId('calendar-selected-day')).toHaveTextContent('5 événements');
  });

  it('opens the full selected day list from an overflow control', async () => {
    const user = userEvent.setup();
    calendarResult.data = {
      data: Array.from({ length: 5 }, (_, i) =>
        mkBooking({ id: 20 + i, title: `Booking #${20 + i}` }),
      ),
    };
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    await user.click(screen.getByTestId('calendar-day-overflow-2026-04-20'));

    const panel = screen.getByTestId('calendar-selected-day');
    expect(panel).toHaveTextContent('lundi 20 avril');
    expect(panel).toHaveTextContent('5 événements');
    expect(within(panel).getByTestId('calendar-selected-day-row-booking-20')).toBeInTheDocument();
    expect(within(panel).getByTestId('calendar-selected-day-row-booking-24')).toBeInTheDocument();
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

  it('exposes a property filter built from the returned events', async () => {
    const user = userEvent.setup();
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    // The filter is a Base UI Select (combobox + popup listbox), not a native
    // <select>. We click the trigger to open the popup, then read the rendered
    // <option role> children.
    await user.click(screen.getByTestId('calendar-property-filter'));
    const options = await screen.findAllByRole('option');
    const labels = options.map((o) => o.textContent?.trim());

    expect(labels[0]).toBe('Tous les biens');
    expect(labels).toContain('Villa Almadies');
    expect(labels).toContain('Appart Point E');
  });

  it('updates the query and shows active state when the property filter changes', async () => {
    const user = userEvent.setup();
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    await user.click(screen.getByTestId('calendar-property-filter'));
    const villaOption = await screen.findByRole('option', { name: 'Villa Almadies' });
    await user.click(villaOption);

    await waitFor(() => {
      expect(useCalendarMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ property_id: 10 }),
      );
    });
    expect(screen.getByTestId('calendar-active-filters')).toHaveTextContent(
      'Bien : Villa Almadies',
    );
  });

  it('can render lease events with a distinct detail link when returned by the API', async () => {
    const user = userEvent.setup();
    calendarResult.data = { data: [mkLease()] };
    render(wrap(<CalendarPage initialFocus={INITIAL_FOCUS} />));

    await user.click(screen.getAllByTestId('calendar-event-pill-lease-3')[0]);

    const panel = await screen.findByTestId('calendar-event-detail');
    expect(within(panel).getAllByText('Bail').length).toBeGreaterThan(0);
    expect(within(panel).getByTestId('calendar-event-open-resource')).toHaveAttribute(
      'href',
      '/app/leases/3',
    );
    expect(within(panel).getByTestId('calendar-event-open-resource')).toHaveTextContent(
      'Ouvrir le bail',
    );
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
