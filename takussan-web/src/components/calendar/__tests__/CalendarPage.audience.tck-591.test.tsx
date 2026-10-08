/**
 * TCK-591, AC27 — le prestataire atteint l'agenda (il était renvoyé vers `/app`) et la page ne lui
 * demande que ses interventions. L'agent, lui, ouvre l'agenda sur « Mes rendez-vous ».
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CalendarPage } from '../CalendarPage';

const { useCalendarMock, redirectMock, getMeMock } = vi.hoisted(() => ({
  useCalendarMock: vi.fn(() => ({ data: { data: [] }, isLoading: false, isError: false })),
  redirectMock: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  getMeMock: vi.fn(),
}));

vi.mock('@/lib/queries/calendar', () => ({
  useCalendar: useCalendarMock,
  calendarQueryKeys: { range: (p: unknown) => ['calendar', 'range', p] as const },
}));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: getMeMock }));

import CalendarLayout from '@/app/(dashboard)/app/calendar/layout';

function rendu(ui: React.ReactElement) {
  const client = new QueryClient();
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

describe('agenda — prestataire et agent (AC27)', () => {
  beforeEach(() => {
    useCalendarMock.mockClear();
    redirectMock.mockClear();
  });

  it('laisse passer le prestataire, et refuse toujours le client seul', async () => {
    getMeMock.mockResolvedValueOnce({ roles: ['service_provider'] });
    await expect(CalendarLayout({ children: null })).resolves.toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();

    getMeMock.mockResolvedValueOnce({ roles: ['customer'] });
    await expect(CalendarLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/app');
  });

  it('ne demande au prestataire que types[]=maintenance, sans filtre de types', () => {
    rendu(<CalendarPage audience="provider" />);

    expect(useCalendarMock).toHaveBeenLastCalledWith(expect.objectContaining({ types: ['maintenance'], mine: false }));
    expect(screen.queryByTestId('calendar-type-toggle-booking')).not.toBeInTheDocument();
    expect(screen.queryByTestId('calendar-mine-toggle')).not.toBeInTheDocument();
  });

  it('ouvre l’agenda de l’agent sur « Mes rendez-vous », qu’il peut décocher', async () => {
    rendu(<CalendarPage audience="staff" defaultMine />);

    expect(useCalendarMock).toHaveBeenLastCalledWith(expect.objectContaining({ mine: true }));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mes rendez-vous' }));
    expect(useCalendarMock).toHaveBeenLastCalledWith(expect.objectContaining({ mine: false }));
  });
});
