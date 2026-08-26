import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { ReportingShell } from '../ReportingShell';

// Les quatre graphiques sont hors sujet ici : ce test porte sur la MÉCANIQUE d'onglets, et les
// monter pour de vrai ferait dépendre son vert de quatre requêtes réseau.
vi.mock('../GrowthChart', () => ({ GrowthChart: () => <div data-testid="panneau-growth" /> }));
vi.mock('../RevenueChart', () => ({ RevenueChart: () => <div data-testid="panneau-revenue" /> }));
vi.mock('../CohortHeatmap', () => ({ CohortHeatmap: () => <div data-testid="panneau-cohorts" /> }));
vi.mock('../FunnelChart', () => ({ FunnelChart: () => <div data-testid="panneau-funnel" /> }));

function rendre() {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ReportingShell />
      </QueryClientProvider>,
    ),
  );
}

describe('<ReportingShell>', () => {
  /**
   * TCK-357 (AC5) — les onglets étaient quatre `<button>` faits main, sans `role="tab"`, sans
   * `aria-selected`, sans navigation au clavier. Passer par `@/components/ui/tabs` apporte les
   * trois ; ce test les assère par les RÔLES, ce qu'un rendu fait main ne pourrait plus cocher.
   */
  it('expose de vrais onglets ARIA, dont un seul est sélectionné', () => {
    rendre();

    const onglets = screen.getAllByRole('tab');
    expect(onglets).toHaveLength(4);
    expect(onglets.filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    expect(onglets[0]).toHaveAttribute('aria-selected', 'true');
  });

  it("ne monte QUE le panneau actif — un montage des quatre ferait quatre requêtes", () => {
    rendre();

    expect(screen.getByTestId('panneau-growth')).toBeInTheDocument();
    expect(screen.queryByTestId('panneau-revenue')).toBeNull();
    expect(screen.queryByTestId('panneau-cohorts')).toBeNull();
    expect(screen.queryByTestId('panneau-funnel')).toBeNull();
  });

  it('change de panneau au clic', async () => {
    const user = userEvent.setup();
    rendre();

    await user.click(screen.getAllByRole('tab')[1]);

    expect(await screen.findByTestId('panneau-revenue')).toBeInTheDocument();
    expect(screen.queryByTestId('panneau-growth')).toBeNull();
  });

  it('navigue au clavier — ce que les boutons faits main ne faisaient pas', async () => {
    const user = userEvent.setup();
    rendre();

    const onglets = screen.getAllByRole('tab');
    onglets[0].focus();
    await user.keyboard('{ArrowRight}');

    expect(onglets[1]).toHaveFocus();
  });
});
