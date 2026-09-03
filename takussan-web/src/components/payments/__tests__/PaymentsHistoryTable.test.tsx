/**
 * TCK-505 (défaut #5) — l'historique des paiements DÉFILE sur mobile au lieu de se compresser.
 *
 * Mesuré à 390 px avant correction : table de 571-611 px sous un conteneur `overflow-hidden` →
 * montant, statut et entité coupés SANS défilement possible ; et comme la table reste `w-full`,
 * ses colonnes se compressent — la date sur 3 lignes dans une colonne < 80 px.
 *
 * Deux moitiés, chacune vérifiée par ablation :
 *   - le conteneur DÉFILE (`overflow-x-auto`) et ne porte AUCUN rognage — sinon
 *     `overflow-hidden overflow-x-auto` passerait vert par accident de cascade ;
 *   - les cellules de date, de montant et de statut ne reviennent pas à la ligne
 *     (`whitespace-nowrap`), pour que la table s'élargisse et défile au lieu de se compresser.
 *
 * jsdom ne mesure rien : le défilement réel est relevé au navigateur par le banc de TCK-505.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { conteneurDefilant, porteUnRognageHorizontal } from '@/test/defilement-horizontal';
import fr from '@/messages/fr.json';
import type { PaymentHistoryRow } from '@/types/invoice';
import { PaymentsHistoryTable } from '../PaymentsHistoryTable';

const usePaymentsHistory = vi.fn();

vi.mock('@/lib/queries/payments', () => ({
  usePaymentsHistory: (...args: unknown[]) => usePaymentsHistory(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

// La pagination n'est pas le sujet : un adaptateur de `next/navigation` qu'on n'a pas à monter ici.
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({
  PropertyPagination: () => null,
}));

const LIGNE: PaymentHistoryRow = {
  source: 'lease',
  id: 7,
  reference_number: 'PAY-2026-0007',
  amount: 250000,
  currency: 'XOF',
  payment_method: 'mobile_money',
  payment_type: 'rent',
  status: 'pending',
  paid_amount: 0,
  remaining_amount: 250000,
  date: '2026-07-01',
  paid_at: null,
  booking_id: null,
  lease_id: 1,
  property_id: 1,
  customer_id: 1,
  created_at: '2026-07-01T00:00:00+00:00',
};

function rendre() {
  return render(withIntl(<PaymentsHistoryTable />));
}

beforeEach(() => {
  vi.clearAllMocks();
  usePaymentsHistory.mockReturnValue({
    isLoading: false,
    isError: false,
    error: null,
    data: {
      data: [LIGNE],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 },
    },
  });
});

describe('PaymentsHistoryTable — défilement horizontal sur petit écran (TCK-505 #5)', () => {
  it('enveloppe la table dans un conteneur qui DÉFILE en X, sans rognage sur le même élément', () => {
    const { container } = rendre();
    const table = screen.getByRole('table');

    const conteneur = conteneurDefilant(table, container);
    expect(conteneur, 'aucun ancêtre défilant avant un ancêtre rognant').not.toBeNull();
    expect(porteUnRognageHorizontal(conteneur!)).toBe(false);
    // Le cadre reste une carte : l'arrondi et la bordure survivent au passage à `overflow-x-auto`.
    expect(conteneur).toHaveClass('rounded-xl', 'border');
  });

  it('ne laisse pas la date, le montant ni le statut revenir à la ligne', () => {
    rendre();
    const { date, amount, status } = fr.payments.history.table;

    for (const libelle of [date, amount, status]) {
      expect(screen.getByRole('columnheader', { name: libelle })).toHaveClass('whitespace-nowrap');
    }
    expect(screen.getByRole('cell', { name: '1 juil. 2026' })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: /250\s?000/ })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: fr.payments.status.pending })).toHaveClass(
      'whitespace-nowrap',
    );
  });
});
