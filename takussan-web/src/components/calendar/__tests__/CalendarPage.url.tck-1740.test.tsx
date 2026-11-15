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
vi.mock('@/lib/queries/agenda', () => ({
  useBiensDeLAgenda: () => ({ data: { data: [] }, isFetching: false }),
  useBienDeLAgenda: (id: number | null) => ({ data: id === null ? undefined : { data: [{ id, title: 'Villa Almadies' }] }, isPending: false }),
  useBiensParIdentifiants: () => ({ data: { data: [] }, isPending: false }),
  useBiensLocatifs: () => ({ data: { pages: [] }, isPending: false, hasNextPage: false }),
}));
vi.mock('@/lib/queries/visits', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/visits')>()),
  useVisitesDeLaVue: () => ({ data: undefined, isPending: true }),
}));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true, useAgenceDuPersonnelActif: () => 1 }));
vi.mock('@/hooks/useMinuteCourante', () => ({ useMinuteCourante: () => new Date('2026-04-15T10:00:00Z') }));

/** Le bureau : la barre de période et la bascule de vue s'y montrent en entier. */
function bureau() {
  window.matchMedia = ((query: string) =>
    ({ matches: /width >=/.test(query), media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

function monte(props: Parameters<typeof CalendarPage>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><CalendarPage {...props} /></QueryClientProvider>));
}

function dernierAppel() {
  return useCalendarMock.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((a) => a.start_date !== a.end_date).at(-1)!;
}

/**
 * TCK-1740 (P168.03) — vue, date, types, bien et « Mes rendez-vous » de l'agenda vivent dans
 * l'URL. Tenus en `useState`, ils revenaient au mois courant, tous types, au retour de l'objet
 * ouvert depuis un événement, au rechargement et au lien copié. TCK-2597 y ajoute `mode`.
 */
describe('CalendarPage — la vue dans l’URL (TCK-1740)', () => {
  beforeEach(() => {
    navigationDeTest.reinitialiser();
    bureau();
    useCalendarMock.mockReset();
    useCalendarMock.mockReturnValue({ data: { data: [] }, isPending: false, isLoading: false, isError: false });
  });

  it('ouvre la vue que porte l’URL', () => {
    navigationDeTest.reinitialiser('view=week&date=2026-03-11&types=visit,task&property=12&mine=1');
    monte({ persona: 'admin' });

    expect(screen.getByTestId('calendar-view-week')).toHaveAttribute('aria-checked', 'true');
    expect(dernierAppel()).toMatchObject({ property_id: 12, types: ['visit', 'task'], mine: true, start_date: '2026-03-09' });
    expect(screen.getByTestId('calendar-active-filters')).toHaveTextContent('Villa Almadies');
  });

  it('ignore les valeurs inconnues', () => {
    navigationDeTest.reinitialiser('view=bidon&date=2026-13-45&types=bidon&property=abc&mode=bidon');
    monte({ persona: 'admin' });

    expect(screen.getByTestId('calendar-view-month')).toHaveAttribute('aria-checked', 'true');
    expect(dernierAppel()).toMatchObject({ property_id: undefined, types: ['booking', 'visit', 'task', 'lease_event', 'maintenance'] });
    expect(String(dernierAppel().start_date)).toMatch(/^2026-0[34]-/);
  });

  it('écrit la vue et la date dans l’URL', async () => {
    const user = userEvent.setup();
    monte({ persona: 'admin' });

    await user.click(screen.getByTestId('calendar-view-week'));
    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?view=week', { scroll: false });

    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(navigationDeTest.requete()).toBe('view=week&date=2026-04-22');
  });

  it('« Mes rendez-vous » coché par défaut ne s’écrit que décoché', async () => {
    const user = userEvent.setup();
    monte({ persona: 'agent', defaultMine: true });

    await user.click(screen.getByRole('button', { name: /^Qui/ }));
    await user.click(await screen.findByRole('radio', { name: 'Toute l’agence' }));
    expect(navigationDeTest.replace).toHaveBeenLastCalledWith('?mine=0', { scroll: false });
  });
});
