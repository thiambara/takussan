import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { useCredits } from '@/components/boost/api';
import { CreditsPanel } from '../CreditsPanel';

vi.mock('@/components/boost/api', () => ({ useCredits: vi.fn() }));

describe('CreditsPanel (TCK-633 lot F)', () => {
  it('montre le solde, les lots avec leur expiration et l’historique', () => {
    vi.mocked(useCredits).mockReturnValue({
      data: {
        data: {
          balance: 540,
          lots: [
            { id: 2, origin: 'admin_grant', initial_amount: 40, remaining_amount: 40, expires_at: '2026-10-22T10:00:00+00:00', reason: null, created_at: '2026-10-12T10:00:00+00:00' },
            { id: 1, origin: 'welcome', initial_amount: 500, remaining_amount: 500, expires_at: null, reason: null, created_at: '2026-10-12T10:00:00+00:00' },
          ],
        },
        movements: [
          { id: 9, type: 'spend', amount: -20, credit_lot_id: 1, property_boost_id: 3, actor_id: 4, reason: null, created_at: '2026-10-12T11:00:00+00:00' },
        ],
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    render(withIntl(<CreditsPanel />));

    expect(screen.getByText('540 crédits')).toBeInTheDocument();
    expect(screen.getByText('Crédits offerts par Takussan')).toBeInTheDocument();
    expect(screen.getByText('Sans expiration')).toBeInTheDocument();
    expect(screen.getByText('Mise en avant')).toBeInTheDocument();
    expect(screen.getByText('-20')).toBeInTheDocument();
  });

  it('dit l’échec de chargement', () => {
    vi.mocked(useCredits).mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() } as never);

    render(withIntl(<CreditsPanel />));

    expect(screen.getByText('Impossible de charger les crédits.')).toBeInTheDocument();
  });
});
