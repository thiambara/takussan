import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { LineChart } from '../LineChart';
import { BarChart } from '../BarChart';
import { StatCard } from '../StatCard';

describe('chart components (TCK-032)', () => {
  it('renders an empty state when series are missing', () => {
    render(withIntl(<LineChart data={{ labels: [], series: [] }} />));
    expect(screen.getByTestId('chart-empty')).toBeInTheDocument();
  });

  it('renders a line series and a legend entry', () => {
    render(withIntl(<LineChart
        title="Test chart"
        data={{
          labels: ['Jan', 'Feb', 'Mar'],
          series: [{ name: 'Revenue', values: [10, 20, 30] }],
        }}
      />));
    const fig = screen.getByTestId('line-chart');
    expect(fig).toBeInTheDocument();
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('Test chart')).toBeInTheDocument();
  });

  // P127.02 (TCK-1355) — un mois sans bien à occuper rend `null` : le tracé s'y coupe, il ne
  // tombe pas à 0 et ne relie pas les deux mois qui l'entourent.
  it('cuts the line on a null point instead of drawing it at zero', () => {
    const { container } = render(withIntl(<LineChart
        data={{
          labels: ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'],
          series: [{ name: 'Occupation', values: [null, 40, null, 50, 60] }],
        }}
      />));
    const d = container.querySelector('svg path')?.getAttribute('d') ?? '';
    const segments = d.split('M').filter(Boolean);
    expect(segments).toHaveLength(2);
    expect(segments[0]).not.toContain('L');
    expect(segments[1].match(/L/g)).toHaveLength(1);
    expect(d).not.toContain('NaN');
  });

  it('renders a bar chart with labels', () => {
    render(withIntl(<BarChart
        data={{
          labels: ['A', 'B'],
          series: [{ name: 'Count', values: [1, 2] }],
        }}
      />));
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
  });

  it('StatCard renders label, value and hint', () => {
    render(withIntl(<StatCard label="Active" value={42} hint="running" accent="success" />));
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
  });
});
