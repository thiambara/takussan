/**
 * TCK-591 (verif-591 passe 2, N3, ADR-0034 §2) — le lien d'agenda est celui du PERSONNEL d'une
 * agence. Le super-admin n'en tient pas : l'API lui refuse le lien sans agence (403
 * `calendar.feed_not_staff`), l'écran ne le lui propose donc pas, alors qu'il garde la console.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { UserRole } from '@/types/user';

const roles = vi.hoisted(() => ({ current: [] as UserRole[] }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ({ roles: roles.current }) }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/components/console', () => ({ PageHeader: () => null }));
vi.mock('@/components/calendar/CalendarPage', () => ({
  CalendarPage: ({ audience }: { audience: string }) => <div data-testid="console">{audience}</div>,
}));
vi.mock('@/components/crm/CalendarSubscription', () => ({
  CalendarSubscription: () => <div data-testid="abonnement" />,
}));

import Page from '../page';

async function rendre(r: UserRole[]) {
  roles.current = r;
  render(await Page());
}

describe('Agenda — abonnement', () => {
  it("propose le lien à l'agent", async () => {
    await rendre(['agent']);
    expect(screen.getByTestId('abonnement')).toBeInTheDocument();
  });

  it("propose le lien à l'administrateur d'agence", async () => {
    await rendre(['agency_admin']);
    expect(screen.getByTestId('abonnement')).toBeInTheDocument();
  });

  it('ne le propose pas au super-admin, qui garde la console', async () => {
    await rendre(['super_admin']);
    expect(screen.queryByTestId('abonnement')).not.toBeInTheDocument();
    expect(screen.getByTestId('console')).toHaveTextContent('staff');
  });
});
