import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import type { DashboardAgencySummary } from '@/lib/queries/dashboard-agency';
import { AgencyActivityFeed } from '../AgencyActivityFeed';

function buildSummary(overrides: Partial<DashboardAgencySummary> = {}): DashboardAgencySummary {
  return {
    agency_id: 1,
    period: { start: '2026-05-01T00:00:00+00:00', end: '2026-05-31T23:59:59+00:00' },
    properties: { total: 10, published: 8, rented: 6, available: 2 },
    leases: { active: 6 },
    customers_count: 84,
    members_count: 5,
    bookings: { pending: 3 },
    maintenance: { open: 1 },
    finance: {
      revenue_month: 0,
      commission_month: 0,
      overdue_count: 0,
      overdue_amount: 0,
      unpaid_rate_percent: 0,
    },
    occupancy: { rate_percent: 60 },
    ...overrides,
  };
}

describe('<AgencyActivityFeed>', () => {
  it('groupe ses compteurs selon la locale ACTIVE, pas une locale écrite en dur (TCK-374)', () => {
    // Un compteur à quatre chiffres est le seul qui distingue les locales : en dessous, `12 345` et
    // `12,345` se confondent avec `345`, et l'assertion resterait verte sur une locale figée.
    render(withIntl(<AgencyActivityFeed summary={buildSummary({ customers_count: 12_345 })} />, 'en'));
    expect(screen.getByText('12,345')).toBeInTheDocument();
    expect(screen.queryByText(/12\s345/)).toBeNull();
  });

  it('lists the four operational counters with deep links', () => {
    const { container } = render(withIntl(<AgencyActivityFeed summary={buildSummary()} />));

    expect(screen.getByRole('heading', { name: 'Activité récente' })).toBeInTheDocument();
    expect(screen.getByText('Réservations en attente')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Interventions ouvertes')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Clients (CRM)')).toBeInTheDocument();
    expect(screen.getByText('84')).toBeInTheDocument();
    expect(screen.getByText("Membres de l'agence")).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining(['/app/bookings', '/app/maintenance', '/app/customers', '/admin/team']),
    );
  });
});
