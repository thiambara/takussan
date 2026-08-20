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
