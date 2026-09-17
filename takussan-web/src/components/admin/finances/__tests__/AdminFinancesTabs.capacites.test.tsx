/**
 * TCK-528 — sur `/admin/finances`, « Générer une facture » et « Créer un reversement » suivent
 * chacun LEUR capacité, comme dans `PaymentsTabs`.
 *
 * La page passe `canEmit` à tout admin d'agence ; un rôle personnalisé peut pourtant ne porter
 * qu'une des deux capacités, et l'API refuserait l'autre (`InvoicePolicy::create`,
 * `PayoutPolicy::create`). Ces tests gardent l'accord entre bouton et serveur, pas une sécurité.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { useCan } from '@/hooks/useCan';
import fr from '@/messages/fr.json';
import { AdminFinancesTabs } from '../AdminFinancesTabs';

vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

// Les tables et les dialogues ont leurs propres tests ; ils tireraient ici leurs requêtes.
vi.mock('@/components/payments/PaymentsHistoryFilters', () => ({ PaymentsHistoryFilters: () => null }));
vi.mock('@/components/payments/PaymentsHistoryTable', () => ({ PaymentsHistoryTable: () => null }));
vi.mock('@/components/payments/InvoicesTable', () => ({ InvoicesTable: () => null }));
vi.mock('@/components/payments/PayoutsTable', () => ({ PayoutsTable: () => null }));
vi.mock('@/components/payments/CreateInvoiceDialog', () => ({ CreateInvoiceDialog: () => null }));
vi.mock('@/components/payments/CreatePayoutDialog', () => ({ CreatePayoutDialog: () => null }));
vi.mock('@/components/payments/InvoiceDetailDialog', () => ({ InvoiceDetailDialog: () => null }));
vi.mock('@/components/payments/PayoutDetailDialog', () => ({ PayoutDetailDialog: () => null }));
vi.mock('../OverduePaymentsTable', () => ({ OverduePaymentsTable: () => null }));

const FACTURER = fr.admin.finances.tabs.newInvoice;
const REVERSER = fr.admin.finances.tabs.newPayout;

function accorder(accordees: readonly string[], isLoading = false) {
  vi.mocked(useCan).mockImplementation((capability) => ({
    can: !isLoading && accordees.includes(capability),
    isLoading,
  }));
}

function rendre(canEmit = true) {
  render(withIntl(<AdminFinancesTabs canEmit={canEmit} />));
}

describe('AdminFinancesTabs — boutons de création gardés par capacité (TCK-528)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lit exactement invoices.create et payouts.create', () => {
    accorder([]);
    rendre();

    const lues = vi.mocked(useCan).mock.calls.map(([capability]) => capability);
    expect(new Set(lues)).toEqual(new Set(['invoices.create', 'payouts.create']));
  });

  it('propose les deux gestes à un admin d’agence qui porte les deux capacités', () => {
    accorder(['invoices.create', 'payouts.create']);
    rendre();

    expect(screen.getByRole('button', { name: FACTURER })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: REVERSER })).toBeInTheDocument();
  });

  it('ne propose que la facture à un rôle qui ne porte pas payouts.create', () => {
    accorder(['invoices.create']);
    rendre();

    expect(screen.getByRole('button', { name: FACTURER })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: REVERSER })).not.toBeInTheDocument();
  });

  it('ne propose que le reversement à un rôle qui ne porte pas invoices.create', () => {
    accorder(['payouts.create']);
    rendre();

    expect(screen.queryByRole('button', { name: FACTURER })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: REVERSER })).toBeInTheDocument();
  });

  it('ne propose rien quand la page refuse l’émission, même avec les capacités', () => {
    accorder(['invoices.create', 'payouts.create']);
    rendre(false);

    expect(screen.queryByRole('button', { name: FACTURER })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: REVERSER })).not.toBeInTheDocument();
    expect(screen.queryByTestId('finances-actions-loading')).not.toBeInTheDocument();
  });

  it('ne propose rien et réserve la place tant que les capacités chargent', () => {
    accorder(['invoices.create', 'payouts.create'], true);
    rendre();

    expect(screen.queryByRole('button', { name: FACTURER })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: REVERSER })).not.toBeInTheDocument();
    expect(screen.getByTestId('finances-actions-loading')).toBeInTheDocument();
  });

  it('retire le repère de chargement une fois les capacités arrivées', () => {
    accorder([]);
    rendre();

    expect(screen.queryByTestId('finances-actions-loading')).not.toBeInTheDocument();
  });
});
