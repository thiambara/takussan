import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { fetchSystemMetrics } from '@/lib/queries/super-admin';
import type { SystemMetrics } from '@/types/super-admin';
import { SystemMetricsGrid } from '../SystemMetricsGrid';
import { withIntl } from '@/test/intl';

vi.mock('@/lib/queries/super-admin', () => ({ fetchSystemMetrics: vi.fn() }));

const BASE: SystemMetrics = {
  agencies: { total: 120, verified: 60, active: 100, suspended: 4, verification_rate: 0.5 },
  users: { total: 400, active: 380 },
  properties: { published: 900, pending_review: 12 },
  leases: { active: 300 },
  revenue: { platform_total_paid: 5_000_000, currency: 'XOF' },
  generated_at: '2026-08-27T10:00:00+00:00',
};

function renderGrid(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>));
}

describe('SystemMetricsGrid (TCK-360)', () => {
  it('rend un delta pour chaque métrique dont l’API fournit le point de comparaison', async () => {
    vi.mocked(fetchSystemMetrics).mockResolvedValue({
      data: {
        ...BASE,
        trend: {
          period_days: 30,
          since: '2026-07-28T10:00:00+00:00',
          previous: { agencies_total: 100, users_total: 500, revenue_platform_total_paid: 4_000_000 },
        },
      },
    });

    renderGrid(<SystemMetricsGrid />);

    // 120 depuis 100 → +20 %. Le SENS est « croissance », pas le signe du nombre.
    expect(await screen.findByText('+20 % sur 30 jours')).toBeInTheDocument();
    // 400 depuis 500 → −20 %. Un delta négatif se rend aussi : c'est une mesure, pas une punition.
    expect(await screen.findByText('-20 % sur 30 jours')).toBeInTheDocument();
    expect(await screen.findByText('+25 % sur 30 jours')).toBeInTheDocument();
  });

  it('ne rend AUCUN delta quand l’API ne fournit pas de point de comparaison (AC5)', async () => {
    vi.mocked(fetchSystemMetrics).mockResolvedValue({
      data: { ...BASE, trend: { period_days: 30, since: '2026-07-28T10:00:00+00:00', previous: {} } },
    });

    renderGrid(<SystemMetricsGrid />);

    await screen.findByTestId('system-metrics-grid');
    expect(screen.queryByText(/sur 30 jours/)).not.toBeInTheDocument();
  });

  /**
   * Les deux tests ci-dessous ferment deux MUTANTS SURVIVANTS relevés par la revue de TCK-360 :
   * les gardes `previous === 0` et `periodDays === undefined` fonctionnaient, mais leur
   * suppression laissait les quatre tests d'origine verts. Une garde que rien ne fait rougir
   * n'est pas gardée — c'est une intention.
   */
  it('ne rend PAS de delta quand le point de comparaison vaut zéro (AC5)', async () => {
    vi.mocked(fetchSystemMetrics).mockResolvedValue({
      data: {
        ...BASE,
        trend: {
          period_days: 30,
          since: '2026-07-28T10:00:00+00:00',
          previous: { agencies_total: 0, users_total: 500 },
        },
      },
    });

    renderGrid(<SystemMetricsGrid />);

    // La tuile « utilisateurs » prouve que ce rendu-là sait rendre un delta…
    expect(await screen.findByText('-20 % sur 30 jours')).toBeInTheDocument();
    // …et qu'il n'y en a pas un second : 120 agences depuis 0, ce n'est pas « +∞ % sur 30 jours »,
    // c'est l'absence de point de comparaison.
    expect(screen.queryAllByText(/sur 30 jours/)).toHaveLength(1);
  });

  it('ne rend PAS de delta quand la tendance ne nomme pas sa période (AC5)', async () => {
    vi.mocked(fetchSystemMetrics).mockResolvedValue({
      data: {
        ...BASE,
        // `period_days` est OBLIGATOIRE dans le type : le cas n'est atteignable qu'au runtime —
        // réponse d'une API plus ancienne, entrée de cache — et c'est exactement ce que la garde
        // couvre. D'où le cast, qui est ici le sujet du test et non un contournement.
        trend: {
          since: '2026-07-28T10:00:00+00:00',
          previous: { agencies_total: 100, users_total: 500 },
        } as NonNullable<SystemMetrics['trend']>,
      },
    });

    renderGrid(<SystemMetricsGrid />);

    const grille = await screen.findByTestId('system-metrics-grid');
    // Mesuré en retirant la garde (2026-08-27) : `t('delta', { days: undefined })` ne lève pas et
    // ne rend pas la clé — next-intl rend le paramètre manquant VIDE, soit « +20 % sur  jours ».
    // C'est donc bien `/jours/` qui attrape l'ablation, et une assertion sur « sur 30 jours »
    // l'aurait laissée passer.
    expect(grille.textContent ?? '').not.toMatch(/jours/);
  });

  it('ne rend aucun delta quand la réponse ne porte pas de bloc de tendance du tout', async () => {
    vi.mocked(fetchSystemMetrics).mockResolvedValue({ data: BASE });

    renderGrid(<SystemMetricsGrid />);

    await screen.findByTestId('system-metrics-grid');
    expect(screen.queryByText(/sur 30 jours/)).not.toBeInTheDocument();
  });

  it('donne une destination à chacune des huit tuiles', async () => {
    vi.mocked(fetchSystemMetrics).mockResolvedValue({ data: BASE });

    renderGrid(<SystemMetricsGrid />);

    const grille = await screen.findByTestId('system-metrics-grid');
    const liens = grille.querySelectorAll('a[href]');
    expect(liens).toHaveLength(8);
    expect([...liens].map((a) => a.getAttribute('href'))).toContain('/super-admin/agencies?status=suspended');
    expect([...liens].map((a) => a.getAttribute('href'))).toContain(
      '/super-admin/properties?filter[status]=pending_review',
    );
  });
});
