/**
 * TCK-2525 — le journal des crédits nomme la dépense et le remboursement d'une place « Mise en avant »
 * de l'agence : la ville (ou « Tout l'annuaire ») et la période, au lieu du libellé générique du type.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreditMovement } from '@/components/boost/types';
import { withIntl } from '@/test/intl';

import { TableDeLHistorique } from '../sections';

const base = {
  credit_lot_id: 1,
  property_boost_id: null,
  actor_id: 1,
  reason: null,
  created_at: '2026-11-16T09:00:00Z',
  boost: null,
} as const;

const MOUVEMENTS: CreditMovement[] = [
  {
    ...base,
    id: 1,
    type: 'spend',
    amount: -100,
    agency_spotlight_id: 4,
    spotlight: { id: 4, city: { id: 5, name: 'Dakar' }, starts_at: '2026-12-01T00:00:00Z', ends_at: '2026-12-08T00:00:00Z' },
  },
  {
    ...base,
    id: 2,
    type: 'refund',
    amount: 57,
    reason: 'Agence suspendue',
    agency_spotlight_id: 5,
    spotlight: { id: 5, city: null, starts_at: '2026-12-10T00:00:00Z', ends_at: '2026-12-17T00:00:00Z' },
  },
];

describe('Journal des crédits — mise en avant de l’agence (TCK-2525)', () => {
  // L'année n'est dite que si elle n'est pas l'année courante : l'horloge est figée.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dit la ville et la période d’une dépense et d’un remboursement de place', () => {
    render(withIntl(<TableDeLHistorique mouvements={MOUVEMENTS} />));

    expect(screen.getByText('Mise en avant — Dakar, du 1 déc. au 8 déc.')).toBeInTheDocument();
    expect(screen.getByText('Mise en avant — Tout l’annuaire, du 10 déc. au 17 déc.')).toBeInTheDocument();
    // Le détail garde l'opération et le motif du remboursement.
    expect(screen.getByText('Remboursement · Agence suspendue')).toBeInTheDocument();
  });
});
