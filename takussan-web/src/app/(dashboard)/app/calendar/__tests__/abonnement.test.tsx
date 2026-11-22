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
// TCK-2597 — l'abonnement est une feuille de l'agenda : la page lui dit seulement s'il y a droit.
vi.mock('@/components/calendar/CalendarPage', () => ({
  CalendarPage: ({ audience, persona, abonnement }: { audience: string; persona: string; abonnement: boolean }) => (
    <div data-testid="console" data-persona={persona}>
      {audience}
      {abonnement ? <div data-testid="abonnement" /> : null}
    </div>
  ),
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

  it("TCK-2597 — l'agent voit son agenda, l'admin celui de l'agence, le bailleur et le prestataire le leur", async () => {
    await rendre(['agent']);
    expect(screen.getByTestId('console')).toHaveAttribute('data-persona', 'agent');
    document.body.innerHTML = '';
    await rendre(['agency_admin']);
    expect(screen.getByTestId('console')).toHaveAttribute('data-persona', 'admin');
    document.body.innerHTML = '';
    await rendre(['owner']);
    expect(screen.getByTestId('console')).toHaveAttribute('data-persona', 'bailleur');
    expect(screen.queryByTestId('abonnement')).not.toBeInTheDocument();
    document.body.innerHTML = '';
    await rendre(['service_provider']);
    expect(screen.getByTestId('console')).toHaveAttribute('data-persona', 'prestataire');
  });
});
