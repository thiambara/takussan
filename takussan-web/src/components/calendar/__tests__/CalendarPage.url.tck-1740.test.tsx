import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import { CalendarPage } from '../CalendarPage';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);

const { useCalendarMock } = vi.hoisted(() => ({ useCalendarMock: vi.fn() }));
vi.mock('@/lib/queries/calendar', () => ({
  useCalendar: useCalendarMock,
  calendarQueryKeys: { range: (p: unknown) => ['calendar', 'range', p] as const },
}));

function monte(props: Parameters<typeof CalendarPage>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><CalendarPage {...props} /></QueryClientProvider>));
}

function dernierAppel() {
  return useCalendarMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

/**
 * TCK-1740 (P168.03) — vue, date, types, bien et « Mes rendez-vous » du calendrier vivent dans
 * l'URL. Tenus en `useState`, ils revenaient au mois courant, tous types, au retour de l'objet
 * ouvert depuis un événement, au rechargement et au lien copié.
 */
describe('CalendarPage — la vue dans l’URL (TCK-1740)', () => {
  beforeEach(() => {
    navigationDeTest.reinitialiser();
    useCalendarMock.mockReset();
    useCalendarMock.mockReturnValue({ data: { data: [] }, isLoading: false, isError: false });
  });

  it('ouvre la vue que porte l’URL', () => {
    navigationDeTest.reinitialiser('view=week&date=2026-03-11&types=visit,task&property=12&mine=1');
    monte();

    expect(screen.getByTestId('calendar-view-week')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('calendar-mine-toggle')).toHaveAttribute('aria-pressed', 'true');
    expect(dernierAppel()).toMatchObject({ property_id: 12, types: ['visit', 'task'], mine: true });
    expect(dernierAppel().start_date).toBe('2026-03-09');
  });

  it('ignore les valeurs inconnues', () => {
    navigationDeTest.reinitialiser('view=bidon&date=2026-13-45&types=bidon&property=abc');
    monte({ initialFocus: new Date(2026, 3, 15) });

    expect(screen.getByTestId('calendar-view-month')).toHaveAttribute('aria-checked', 'true');
    expect(dernierAppel()).toMatchObject({ property_id: undefined, types: ['booking', 'visit', 'task', 'lease_event', 'maintenance'] });
    expect(String(dernierAppel().start_date)).toMatch(/^2026-0[34]-/);
  });

  it('écrit la vue, les types, « Mes rendez-vous » et la date dans l’URL', async () => {
    const user = userEvent.setup();
    monte({ initialFocus: new Date(2026, 3, 15) });

    await user.click(screen.getByTestId('calendar-view-week'));
    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?view=week', { scroll: false });

    await user.click(screen.getByTestId('calendar-type-toggle-booking'));
    expect(navigationDeTest.requete()).toBe('view=week&types=visit%2Ctask%2Clease_event%2Cmaintenance');

    await user.click(screen.getByTestId('calendar-mine-toggle'));
    expect(navigationDeTest.requete()).toContain('mine=1');

    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(navigationDeTest.requete()).toContain('date=2026-04-22');
  });

  it('« Mes rendez-vous » coché par défaut ne s’écrit que décoché', async () => {
    const user = userEvent.setup();
    monte({ defaultMine: true });

    await user.click(screen.getByTestId('calendar-mine-toggle'));
    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?mine=0', { scroll: false });
  });
});
