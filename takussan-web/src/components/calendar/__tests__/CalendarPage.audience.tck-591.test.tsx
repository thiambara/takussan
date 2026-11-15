/**
 * TCK-591, AC27 — le prestataire atteint l'agenda (il était renvoyé vers `/app`). Ce que la page lui
 * demande (ses interventions seules), et l'agent sur « Mes rendez-vous » : `CalendarPage.test.tsx`
 * (TCK-2597).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock, getMeMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
  getMeMock: vi.fn(),
}));

vi.mock('next/navigation', async () => ({
  ...(await import('@/test/navigation-url')).moduleNavigation,
  redirect: redirectMock,
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: getMeMock }));
// Le layout est aussi la frontière de dictionnaire de l'agenda (ADR-0022, amendement du
// 2026-10-25) : seule sa garde est éprouvée ici.
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));

import CalendarLayout from '@/app/(dashboard)/app/calendar/layout';

describe('agenda — prestataire (AC27)', () => {
  beforeEach(() => {
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
});
