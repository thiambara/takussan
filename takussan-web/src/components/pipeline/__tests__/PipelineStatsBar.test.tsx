import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { PipelineStatsBar } from '../PipelineStatsBar';
import frMessages from '@/messages/fr.json';
import type { PipelineStats } from '@/types/pipeline';

const stats: PipelineStats = {
  stage_counts: {
    lead: 5,
    prospect: 3,
    qualified: 2,
    negotiating: 1,
    converted: 4,
    lost: 2,
  },
  stage_changes_last_30d: 17,
  avg_time_in_stage: { lead: 1.2, qualified: 4.7 } as Record<string, number>,
  conversion_rate: 0.6667,
};

function withIntl(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      {node}
    </NextIntlClientProvider>
  );
}

describe('<PipelineStatsBar>', () => {
  it('renders 4 widget tiles with computed values', () => {
    render(withIntl(<PipelineStatsBar stats={stats} />));

    // active = lead + prospect + qualified + negotiating = 5 + 3 + 2 + 1 = 11
    expect(screen.getByText('11')).toBeInTheDocument();
    // changes 30d
    expect(screen.getByText('17')).toBeInTheDocument();
    // conversion rate 66.7 %
    expect(screen.getByText(/66\.7\s*%/)).toBeInTheDocument();
    // avg time qualified = 4.7 j
    expect(screen.getByText(/4\.7\s*j/)).toBeInTheDocument();
  });

  it('renders dashes when stats are absent', () => {
    render(withIntl(<PipelineStatsBar stats={undefined} isLoading />));
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('triggers onClickWidget on user click', async () => {
    const handler = vi.fn();
    const { getByText } = render(
      withIntl(<PipelineStatsBar stats={stats} onClickWidget={handler} />),
    );
    (getByText('Prospects actifs').closest('button') as HTMLButtonElement).click();
    expect(handler).toHaveBeenCalledWith('active');
  });
});

/**
 * TCK-505, défaut #9 — quatre colonnes dès `md` dans la coque `/app` (barre latérale 256 px) :
 * tuiles à ~120 px à 768. Les colonnes se posent dès `lg`. L'ablation : garder `md:grid-cols-4`
 * à côté de `lg:grid-cols-4` rougit l'assertion d'absence.
 */
describe('<PipelineStatsBar> — quatre colonnes dès lg, pas dès md (TCK-505 #9)', () => {
  it('la barre passe à quatre colonnes à lg seulement', () => {
    render(withIntl(<PipelineStatsBar stats={stats} />));
    const classes = screen.getByTestId('pipeline-stats-bar').className.split(/\s+/);
    expect(classes).toContain('lg:grid-cols-4');
    expect(classes).not.toContain('md:grid-cols-4');
  });
});
