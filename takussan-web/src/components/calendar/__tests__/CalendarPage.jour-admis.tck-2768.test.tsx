import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
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

function monte(props: Parameters<typeof CalendarPage>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><CalendarPage {...props} /></QueryClientProvider>));
}

function dernierAppel() {
  return useCalendarMock.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((a) => a.start_date !== a.end_date).at(-1)!;
}

/**
 * TCK-2768 (q2 de la vérification de 7981e617d) — l'agenda lisait `?date=` en jour RÉEL, sans borne d'années :
 * « 0001-01-01 » partait en `start_date`, que l'API refuse désormais (422, `JourIso`), et l'agenda restait vide.
 * Le jour refusé est ignoré : l'agenda s'ouvre sur son jour par défaut.
 */
describe('CalendarPage — un jour d’URL que l’API refuserait est ignoré (TCK-2768)', () => {
  beforeEach(() => {
    navigationDeTest.reinitialiser();
    useCalendarMock.mockReset();
    useCalendarMock.mockReturnValue({ data: { data: [] }, isPending: false, isLoading: false, isError: false });
  });

  it('« 0001-01-01 » et « 2200-01-01 » n’ouvrent pas l’agenda sur l’an 1 ni après le plafond', () => {
    for (const jour of ['0001-01-01', '2200-01-01']) {
      useCalendarMock.mockClear();
      navigationDeTest.reinitialiser(`view=week&date=${jour}`);
      const { unmount } = monte({ persona: 'admin' });
      expect(String(dernierAppel().start_date), jour).toMatch(/^2026-04-/);
      unmount();
    }
  });

  it('un jour admis ouvre sa semaine', () => {
    navigationDeTest.reinitialiser('view=week&date=2026-03-11');
    monte({ persona: 'admin' });
    expect(dernierAppel()).toMatchObject({ start_date: '2026-03-09' });
  });
});
