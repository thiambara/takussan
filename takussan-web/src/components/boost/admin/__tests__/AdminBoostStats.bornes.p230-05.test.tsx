/**
 * P230.05 (TCK-2236) — « Du » et « Au » des statistiques de boost suivent `BoostStatsRequest` :
 * `to` `after_or_equal:from` et `before_or_equal:` demain (jour de l'API), fenêtre de 92 jours au
 * plus. Navigateur à New York, 01:00 Z le 25 octobre : le jour de l'API est le 25.
 */
process.env.TZ = 'America/New_York';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AdminBoostStats } from '../AdminBoostStats';

vi.mock('../api', () => ({
  fetchBoostStats: () => Promise.resolve({ data: [], totals: { impressions: 0, clicks: 0, ctr: 0 } }),
}));

describe('AdminBoostStats — bornes de la fenêtre (P230.05)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('« Au » va de « Du » à demain, « Du » reste dans les 92 jours avant « Au »', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <AdminBoostStats />
      </QueryClientProvider>,
    ));

    const du = screen.getByLabelText('Du');
    const au = screen.getByLabelText('Au');
    // Fenêtre par défaut : du 2026-09-26 (J-29) au 2026-10-25.
    expect(au).toHaveAttribute('min', '2026-09-26');
    expect(au).toHaveAttribute('max', '2026-10-26');
    expect(du).toHaveAttribute('max', '2026-10-25');
    expect(du).toHaveAttribute('min', '2026-07-25');

    // Un « Du » ancien ramène le « max » d'« Au » à 92 jours après lui.
    fireEvent.change(du, { target: { value: '2026-06-01' } });
    expect(au).toHaveAttribute('max', '2026-09-01');
  });
});
