/**
 * TCK-2131 (P219.02) — chaque motif de sonde a son libellé, et un motif inconnu du dictionnaire
 * s'affiche en code encadré (`hint.value`) au lieu de la clé brute.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { HealthReason, PlatformHealth } from '@/types/super-admin';
import { HealthDashboard } from '../system-health';

const A = '2026-10-24T10:00:00.000Z';

const sante: { courante: PlatformHealth } = {
  courante: {
    db: { status: 'ok', latency_ms: 3, checked_at: A },
    cache: { status: 'ok', value: 'ok', checked_at: A },
    storage: { status: 'ok', value: 'ok', checked_at: A },
    mail: { status: 'ok', driver: 'smtp', checked_at: A },
    sms: { status: 'ok', driver: 'mtarget', checked_at: A },
    queue: { status: 'ok', pending: 0, processing: 0, failed_24h: 0, checked_at: A },
    proxies: { status: 'degraded', reason: 'wildcard_trusts_nobody', checked_at: A },
    lemon_squeezy_webhook: { status: 'degraded', reason: 'signing_secret_missing', checked_at: A },
    status: 'degraded',
    generated_at: A,
  },
};

vi.mock('@/lib/queries/super-admin', () => ({
  fetchPlatformHealth: vi.fn(async () => ({ data: sante.courante })),
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

describe('HealthDashboard — motifs des sondes (TCK-2131)', () => {
  it('traduit wildcard_trusts_nobody et signing_secret_missing', async () => {
    monter();

    expect(await screen.findByText(/« \* » ne fait confiance à aucun mandataire/)).toBeInTheDocument();
    expect(screen.getByText(/Secret de signature absent de la configuration/)).toBeInTheDocument();
    expect(screen.queryByText(/hint\.reason/)).not.toBeInTheDocument();
  });

  it('encadre un motif sans libellé au lieu de peindre la clé', async () => {
    sante.courante = {
      ...sante.courante,
      proxies: { status: 'degraded', reason: 'motif_inconnu' as HealthReason, checked_at: A },
    };
    monter();

    expect(await screen.findByText(/Valeur : motif_inconnu/)).toBeInTheDocument();
    expect(screen.queryByText(/hint\.reason/)).not.toBeInTheDocument();
  });
});
