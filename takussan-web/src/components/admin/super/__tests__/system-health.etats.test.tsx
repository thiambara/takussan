/**
 * TCK-600 — la page Santé distingue « dégradé » de « en panne », dit l'état général, et date
 * chaque sonde. Les nouvelles sondes (médias, recherche, files, workers) y figurent.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PlatformHealth } from '@/types/super-admin';
import { HealthDashboard } from '../system-health';

const A = '2026-10-08T10:00:00.000Z';

const SANTE: PlatformHealth = {
  db: { status: 'ok', latency_ms: 3, checked_at: A },
  cache: { status: 'ok', value: 'ok', checked_at: A },
  storage: { status: 'ok', value: 'ok', checked_at: A },
  media_storage: { status: 'failed', error: 'R2 injoignable', checked_at: A },
  mail: { status: 'degraded', driver: 'log', reason: 'no_delivery', checked_at: A },
  sms: { status: 'ok', driver: 'mtarget', checked_at: A },
  search: { status: 'ok', documents: 10, expected: 10, gap: 0, checked_at: A },
  queue: { status: 'degraded', pending: 4, processing: 0, failed_24h: 0, oldest_pending_seconds: 900, checked_at: A },
  workers: { status: 'ok', checked_at: A },
  cdn: { status: 'ok', value: 'disabled', checked_at: A },
  scheduler: { last_run_at: A },
  status: 'failed',
  generated_at: A,
};

vi.mock('@/lib/queries/super-admin', () => ({
  fetchPlatformHealth: vi.fn(async () => ({ data: SANTE })),
}));

function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <HealthDashboard />
    </QueryClientProvider>,
    'fr',
  ));
}

describe('HealthDashboard — états (TCK-600)', () => {
  it('distingue « Dégradé » de « En panne » et rend l’état général', async () => {
    monter();

    // Les libellés des tuiles sont rendus dès le chargement : attendre l'état général, qui n'existe
    // qu'avec la réponse.
    expect(await screen.findByText('État général :')).toBeInTheDocument();
    expect(screen.getByText('Médias')).toBeInTheDocument();
    expect(screen.getAllByText('Dégradé')).toHaveLength(2);
    // Une panne de médias, et l'état général : deux « En panne ».
    expect(screen.getAllByText('En panne')).toHaveLength(2);
    expect(document.querySelectorAll('[data-tone="attention"]')).toHaveLength(2);
  });

  it('traduit la raison et date chaque sonde', async () => {
    monter();

    expect(await screen.findByText(/Aucun envoi réel \(pilote de test\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/Sondé à/)).toHaveLength(10);
  });

  it('rend la plus longue attente des files', async () => {
    monter();

    await screen.findByText('État général :');
    const tuile = screen.getByText('Plus longue attente (s)').closest('div')!.parentElement!;
    expect(within(tuile).getByText('900')).toBeInTheDocument();
  });
});
