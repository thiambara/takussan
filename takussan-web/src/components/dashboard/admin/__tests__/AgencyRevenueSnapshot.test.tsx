import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AgencyRevenueSnapshot } from '../AgencyRevenueSnapshot';

describe('<AgencyRevenueSnapshot>', () => {
  it('shows an empty notice when no timeseries is provided', () => {
    render(<AgencyRevenueSnapshot />);
    expect(screen.getByText('Pas encore de données à afficher.')).toBeInTheDocument();
  });

  it('renders a bar chart and the cumulative total when timeseries is present', () => {
    render(
      <AgencyRevenueSnapshot
        timeseries={{
          months: ['2025-06', '2025-07', '2025-08'],
          revenue: [100_000, 200_000, 300_000],
          occupancy: [50, 55, 60],
        }}
      />,
    );

    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    // Cumulative revenue across the 3 months: 600_000 XOF formatted in fr-SN.
    expect(screen.getByText(/600\s?000\s*F\s?CFA/)).toBeInTheDocument();
  });
});
