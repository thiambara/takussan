/**
 * TCK-2321 (P177.05) — un mois dont le relevé a été envoyé montre ce qui a été envoyé, sa date, et
 * ce qui a été écrit depuis en rectificatif. Sans instantané, rien de tout cela.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { OwnerStatementPanel } from '../OwnerStatementPanel';

const REPONSE = vi.hoisted(() => ({
  isLoading: false,
  isError: false,
  error: null,
  data: {
    data: {
      period: '2026-09',
      annual: false,
      currency: 'XOF',
      totals: { gross: 220000, commission: 22000, fees: 0, net: 198000, paid_out: 0 },
      payouts: [],
      snapshot: { sent_at: '2026-10-01T08:00:00+00:00' } as { sent_at: string } | null,
      rectification: {
        as_of: '2026-11-20T10:00:00+00:00',
        totals: { gross: 420000, commission: 42000, fees: 0, net: 378000, paid_out: 0 },
        delta: { gross: 200000, commission: 20000, net: 180000 },
        lines: { added: {}, removed: {} },
      } as object | null,
    },
  },
}));
vi.mock('@/lib/queries/payments', () => ({ useOwnerStatement: () => REPONSE }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const sansEspaces = (s: string | null | undefined) => (s ?? '').replace(/[\s  ]/g, '');

describe('OwnerStatementPanel — le relevé envoyé et son rectificatif (TCK-2321)', () => {
  it('montre les totaux envoyés, la date d’envoi et l’écart écrit depuis', () => {
    render(withIntl(<OwnerStatementPanel />));

    expect(sansEspaces(screen.getAllByText('Net')[0].nextElementSibling?.textContent)).toBe('198000FCFA');
    expect(screen.getByText(/^Relevé envoyé le /)).toBeInTheDocument();

    const rectificatif = screen.getByRole('status');
    expect(rectificatif).toHaveTextContent(/^Rectificatif au /);
    expect(sansEspaces(rectificatif.textContent)).toContain('Encaissé+200000FCFA');
    expect(sansEspaces(rectificatif.textContent)).toContain('Net+180000FCFA');
  });

  it('sans instantané : ni date d’envoi ni rectificatif', () => {
    REPONSE.data.data.snapshot = null;
    REPONSE.data.data.rectification = null;
    render(withIntl(<OwnerStatementPanel />));

    expect(screen.queryByText(/^Relevé envoyé le /)).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
