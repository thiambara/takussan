import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import { DashboardMeKpis } from '../DashboardMeKpis';

describe('<DashboardMeKpis>', () => {
  it('renders the four agency tiles with formatted values', () => {
    render(withIntl(<DashboardMeKpis
        role="agency_admin"
        metrics={{
          properties_total: 42,
          leases_active: 31,
          revenue_month: 1540000,
          overdue_count: 3,
        }}
      />));

    expect(screen.getByText('Biens')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Baux actifs')).toBeInTheDocument();
    expect(screen.getByText('31')).toBeInTheDocument();
    expect(screen.getByText('Revenus du mois')).toBeInTheDocument();
    // Currency formatting (XOF, fr-SN locale): grouping + currency suffix.
    expect(screen.getByText(/1\s?540\s?000\s*F\s?CFA/)).toBeInTheDocument();
    expect(screen.getByText('Impayés')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('formats owner cashflow of 0 as a real value (not "—")', () => {
    render(withIntl(<DashboardMeKpis
        role="owner"
        metrics={{
          portfolio_total: 5,
          leases_active: 4,
          cashflow_month: 0,
          overdue_amount: 0,
        }}
      />));

    const cashflowLabel = screen.getByText('Cashflow du mois');
    const cashflowTile = cashflowLabel.parentElement!;
    expect(cashflowTile.textContent).toMatch(/0\s*F\s?CFA/);
    expect(cashflowTile.textContent).not.toContain('—');
  });

  it('falls back to "—" when tenant has no next_payment', () => {
    render(withIntl(<DashboardMeKpis
        role="tenant"
        metrics={{
          leases_active: 1,
          next_payment: null,
          overdue_amount: 0,
          recent_documents: [],
        }}
      />));

    expect(screen.getByText('Prochaine échéance')).toBeInTheDocument();
    // The placeholder appears for next_payment AND should also appear if other
    // currency/number fields lack values; the tile we care about is the one
    // labelled "Prochaine échéance".
    const heading = screen.getByText('Prochaine échéance');
    const tile = heading.parentElement!;
    expect(tile.textContent).toContain('—');
  });

  it('marks the agent task tile warning when there are overdue tasks', () => {
    const { container } = render(withIntl(<DashboardMeKpis
        role="agent"
        metrics={{
          properties_managed: 10,
          pipeline_total: 7,
          tasks_open: 4,
          tasks_overdue: 2,
          commissions_month: 250000,
        }}
      />));

    expect(screen.getByText('Tâches ouvertes')).toBeInTheDocument();
    expect(screen.getByText('2 en retard')).toBeInTheDocument();
    // The warning accent applies the amber background class to the tile root.
    // TCK-381 — l'accent d'avertissement passe par le JETON `--warning`, plus par l'ambre brut.
    expect(container.querySelector('[class*="bg-warning/"]')).not.toBeNull();
  });
});
