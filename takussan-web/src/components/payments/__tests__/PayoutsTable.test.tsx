/**
 * TCK-505 (défaut #5) — la liste des reversements DÉFILE sur mobile au lieu de se compresser.
 *
 * Même défaut et même correctif que `PaymentsHistoryTable` : conteneur `overflow-hidden` → brut,
 * net, statut et « Ouvrir » coupés sans défilement, période cassée sur plusieurs lignes.
 * Voir l'en-tête de `PaymentsHistoryTable.test.tsx` pour ce que ces tests gardent, et ce que jsdom
 * ne peut pas mesurer.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { conteneurDefilant, porteUnRognageHorizontal } from '@/test/defilement-horizontal';
import fr from '@/messages/fr.json';
import type { Payout } from '@/types/invoice';
import { PayoutsTable } from '../PayoutsTable';

const usePayouts = vi.fn();

vi.mock('@/lib/queries/payments', () => ({
  usePayouts: (...args: unknown[]) => usePayouts(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/components/property-dashboard/PropertyPagination', () => ({
  PropertyPagination: () => null,
}));

const REVERSEMENT: Payout = {
  id: 5,
  reference_number: 'PO-2026-0005',
  lease_id: 1,
  booking_id: null,
  agency_id: 1,
  landlord_id: 9,
  issued_by_id: 2,
  status: 'scheduled',
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  gross_amount: 250000,
  commission_amount: 25000,
  fees_amount: null,
  net_amount: 225000,
  currency: 'XOF',
  payment_method: null,
  transaction_id: null,
  scheduled_at: null,
  processed_at: null,
  failed_reason: null,
  notes: null,
  created_at: '2026-07-01T00:00:00+00:00',
};

function rendre() {
  return render(withIntl(<PayoutsTable onSelect={vi.fn()} />));
}

beforeEach(() => {
  vi.clearAllMocks();
  usePayouts.mockReturnValue({
    isLoading: false,
    isError: false,
    error: null,
    data: {
      data: [REVERSEMENT],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    },
  });
});

describe('PayoutsTable — défilement horizontal sur petit écran (TCK-505 #5)', () => {
  it('enveloppe la table dans un conteneur qui DÉFILE en X, sans rognage sur le même élément', () => {
    const { container } = rendre();
    const table = screen.getByRole('table');

    const conteneur = conteneurDefilant(table, container);
    expect(conteneur, 'aucun ancêtre défilant avant un ancêtre rognant').not.toBeNull();
    expect(porteUnRognageHorizontal(conteneur!)).toBe(false);
    expect(conteneur).toHaveClass('rounded-xl', 'border');
  });

  it('ne laisse pas la période, les montants ni le statut revenir à la ligne', () => {
    rendre();
    const { period, gross, net, status } = fr.payments.payouts.table;

    for (const libelle of [period, gross, net, status]) {
      expect(screen.getByRole('columnheader', { name: libelle })).toHaveClass('whitespace-nowrap');
    }
    expect(screen.getByRole('cell', { name: /1 juil\. 2026 → 31 juil\. 2026/ })).toHaveClass(
      'whitespace-nowrap',
    );
    expect(screen.getByRole('cell', { name: /250\s?000/ })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: /225\s?000/ })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: fr.payments.payoutStatus.scheduled })).toHaveClass(
      'whitespace-nowrap',
    );
  });
});
