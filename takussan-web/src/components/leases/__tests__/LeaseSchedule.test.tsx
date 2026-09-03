/**
 * TCK-505 (défaut #5) — l'échéancier du bail DÉFILE sur mobile au lieu de se compresser.
 *
 * Mesuré à 390 px avant correction : table de 396 px sous un conteneur `overflow-hidden` → colonne
 * d'actions (« Payer en ligne ») coupée sans défilement, et la période « 1 juil. 2026 → 31 juil.
 * 2026 » cassée sur plusieurs lignes dans une colonne étroite.
 *
 * Deux moitiés, chacune vérifiée par ablation : le conteneur DÉFILE sans porter de rognage, et les
 * cellules de période, d'échéance, de montant et de statut ne reviennent pas à la ligne. jsdom ne
 * mesure rien : le défilement réel est relevé au navigateur par le banc de TCK-505.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { conteneurDefilant, porteUnRognageHorizontal } from '@/test/defilement-horizontal';
import fr from '@/messages/fr.json';
import type { LeasePayment } from '@/types/lease';
import { LeaseSchedule } from '../LeaseSchedule';

const useLeasePayments = vi.fn();

vi.mock('@/lib/queries/leases', () => ({
  useLeasePayments: (...args: unknown[]) => useLeasePayments(...args),
}));

// Aucun fournisseur configuré → `PayOnlineButton` ne rend rien : le bouton n'est pas le sujet.
vi.mock('@/hooks/usePaymentProviders', () => ({
  usePaymentProviders: () => ({ providers: [] }),
}));

const ECHEANCE: LeasePayment = {
  id: 11,
  lease_id: 1,
  payer_id: 4,
  collector_id: null,
  reference_number: 'LP-2026-0011',
  amount: 250000,
  currency: 'XOF',
  payment_method: null,
  payment_type: 'rent',
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  due_date: '2026-07-05',
  paid_at: '2026-07-03T00:00:00+00:00',
  status: 'paid',
  late_fee: null,
  transaction_id: null,
  notes: null,
  created_at: '2026-07-01T00:00:00+00:00',
  updated_at: '2026-07-03T00:00:00+00:00',
};

function rendre() {
  return render(withIntl(<LeaseSchedule leaseId={1} agencyId={1} />));
}

beforeEach(() => {
  vi.clearAllMocks();
  useLeasePayments.mockReturnValue({
    data: { data: [ECHEANCE] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe('LeaseSchedule — défilement horizontal sur petit écran (TCK-505 #5)', () => {
  it('enveloppe la table dans un conteneur qui DÉFILE en X, sans rognage sur le même élément', () => {
    const { container } = rendre();
    const table = screen.getByRole('table');

    const conteneur = conteneurDefilant(table, container);
    expect(conteneur, 'aucun ancêtre défilant avant un ancêtre rognant').not.toBeNull();
    expect(porteUnRognageHorizontal(conteneur!)).toBe(false);
    expect(conteneur).toHaveClass('rounded-xl', 'border');
  });

  it('ne laisse pas la période, l’échéance, le montant ni le statut revenir à la ligne', () => {
    rendre();
    const { colPeriod, colDueDate, colAmount, colStatus } = fr.lease.schedule;

    for (const libelle of [colPeriod, colDueDate, colAmount, colStatus]) {
      expect(screen.getByRole('columnheader', { name: libelle })).toHaveClass('whitespace-nowrap');
    }
    expect(screen.getByRole('cell', { name: /1 juil\. 2026 → 31 juil\. 2026/ })).toHaveClass(
      'whitespace-nowrap',
    );
    expect(screen.getByRole('cell', { name: '5 juil. 2026' })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: /250\s?000/ })).toHaveClass('whitespace-nowrap');
    expect(screen.getByRole('cell', { name: fr.lease.schedule.status.paid })).toHaveClass(
      'whitespace-nowrap',
    );
  });
});
