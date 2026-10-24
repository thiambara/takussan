/**
 * TCK-2129 (P219.01) — une sonde en panne se voit sur sa tuile.
 *
 * Le `status` global est le pire des quatorze sondes de l'API ; la page n'en rendait que dix. Avec
 * le seul planificateur en panne, elle disait « État général : En panne » au-dessus de dix « OK ».
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PlatformHealth } from '@/types/super-admin';
import { HealthDashboard } from '../system-health';

const A = '2026-10-24T10:00:00.000Z';

const SANTE: PlatformHealth = {
  db: { status: 'ok', latency_ms: 3, checked_at: A },
  cache: { status: 'ok', value: 'ok', checked_at: A },
  storage: { status: 'ok', value: 'ok', checked_at: A },
  media_storage: { status: 'ok', value: 'ok', checked_at: A },
  mail: { status: 'ok', driver: 'smtp', checked_at: A },
  sms: { status: 'ok', driver: 'mtarget', checked_at: A },
  whatsapp: { status: 'ok', driver: 'cloud', attempts_1h: 0, failure_rate_1h: 0, checked_at: A },
  search: { status: 'ok', documents: 10, expected: 10, gap: 0, checked_at: A },
  queue: { status: 'ok', pending: 0, processing: 0, failed_24h: 0, oldest_pending_seconds: 0, checked_at: A },
  workers: { status: 'ok', checked_at: A },
  cdn: { status: 'ok', value: 'disabled', checked_at: A },
  scheduler: { status: 'failed', last_run_at: null, checked_at: A },
  proxies: { status: 'ok', checked_at: A },
  lemon_squeezy_webhook: { status: 'ok', checked_at: A },
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

describe('HealthDashboard — les quatorze sondes (TCK-2129)', () => {
  it('nomme le planificateur quand il est seul en panne', async () => {
    monter();

    expect(await screen.findByText('État général :')).toBeInTheDocument();
    expect(screen.getByText('Planificateur')).toBeInTheDocument();
    // L'état général et la tuile du planificateur : deux « En panne », pas un seul orphelin.
    expect(screen.getAllByText('En panne')).toHaveLength(2);
  });

  it('rend une tuile par sonde', async () => {
    monter();

    await screen.findByText('État général :');
    for (const libelle of ['WhatsApp', 'Planificateur', 'Mandataires de confiance', 'Webhook Lemon Squeezy']) {
      expect(screen.getByText(libelle)).toBeInTheDocument();
    }
    expect(screen.getAllByText(/Sondé à/)).toHaveLength(14);
  });
});
