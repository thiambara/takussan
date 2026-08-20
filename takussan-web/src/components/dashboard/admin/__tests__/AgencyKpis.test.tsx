import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import type { DashboardAgencySummary } from '@/lib/queries/dashboard-agency';
import { AgencyKpis } from '../AgencyKpis';

function buildSummary(overrides: Partial<DashboardAgencySummary> = {}): DashboardAgencySummary {
  return {
    agency_id: 1,
    period: { start: '2026-05-01T00:00:00+00:00', end: '2026-05-31T23:59:59+00:00' },
    properties: { total: 42, published: 30, rented: 21, available: 9 },
    leases: { active: 21 },
    customers_count: 120,
    members_count: 7,
    bookings: { pending: 5 },
    maintenance: { open: 2 },
    finance: {
      revenue_month: 1_540_000,
      commission_month: 154_000,
      overdue_count: 3,
      overdue_amount: 480_000,
      unpaid_rate_percent: 4.2,
    },
    occupancy: { rate_percent: 50 },
    ...overrides,
  };
}

describe('<AgencyKpis>', () => {
  it('renders the six tiles with formatted values', () => {
    render(withIntl(<AgencyKpis summary={buildSummary()} />));

    expect(screen.getByText('Biens')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('30 publiés')).toBeInTheDocument();
    expect(screen.getByText('Baux actifs')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText("Taux d'occupation")).toBeInTheDocument();
    expect(screen.getByText(/50\s*%/)).toBeInTheDocument();
    expect(screen.getByText('Revenus du mois')).toBeInTheDocument();
    expect(screen.getByText(/1\s?540\s?000\s*F\s?CFA/)).toBeInTheDocument();
    expect(screen.getByText('Impayés')).toBeInTheDocument();
    expect(screen.getByText(/480\s?000\s*F\s?CFA/)).toBeInTheDocument();
    expect(screen.getByText('3 échéances')).toBeInTheDocument();
    expect(screen.getByText("Taux d'impayés")).toBeInTheDocument();
  });

  it('marks the unpaid rate tile as warning when ≥ 10 %', () => {
    const { container } = render(withIntl(<AgencyKpis
        summary={buildSummary({
          finance: {
            revenue_month: 0,
            commission_month: 0,
            overdue_count: 5,
            overdue_amount: 1_000_000,
            unpaid_rate_percent: 18,
          },
        })}
      />));

    expect(container.querySelector('.bg-amber-50')).not.toBeNull();
  });

  it('hides the impayés hint and danger accent when there are no overdue payments', () => {
    const { container } = render(withIntl(<AgencyKpis
        summary={buildSummary({
          finance: {
            revenue_month: 1_000_000,
            commission_month: 100_000,
            overdue_count: 0,
            overdue_amount: 0,
            unpaid_rate_percent: 0,
          },
        })}
      />));

    expect(screen.queryByText(/échéances/)).toBeNull();
    expect(container.querySelector('.bg-rose-50')).toBeNull();
  });
});
