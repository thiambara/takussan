/**
 * TCK-528 — « Générer une facture » et « Créer un reversement » suivent chacun LEUR capacité.
 *
 * L'API juge désormais `invoices.create` et `payouts.create` sur le profil actif
 * (`InvoicePolicy::create`, `PayoutPolicy::create`). Le bouton ne fait que ne pas proposer un geste
 * qui rendrait 403 : ces tests gardent l'accord entre les deux, pas une sécurité.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { useCan } from '@/hooks/useCan';
import fr from '@/messages/fr.json';
import { PaymentsTabs } from '../PaymentsTabs';

vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

// Les tables et les dialogues ont leurs propres tests ; ils tireraient ici leurs requêtes.
vi.mock('../PaymentsHistoryFilters', () => ({ PaymentsHistoryFilters: () => null }));
vi.mock('../PaymentsHistoryTable', () => ({ PaymentsHistoryTable: () => null }));
vi.mock('../InvoicesTable', () => ({ InvoicesTable: () => null }));
vi.mock('../PayoutsTable', () => ({ PayoutsTable: () => null }));
vi.mock('../CreateInvoiceDialog', () => ({ CreateInvoiceDialog: () => null }));
vi.mock('../CreatePayoutDialog', () => ({ CreatePayoutDialog: () => null }));
vi.mock('../InvoiceDetailDialog', () => ({ InvoiceDetailDialog: () => null }));
vi.mock('../PayoutDetailDialog', () => ({ PayoutDetailDialog: () => null }));

const FACTURER = fr.payments.actions.createInvoice;
const REVERSER = fr.payments.actions.createPayout;

function accorder(accordees: readonly string[], isLoading = false) {
  vi.mocked(useCan).mockImplementation((capability) => ({
    can: !isLoading && accordees.includes(capability),
    isLoading,
  }));
}

function rendre() {
  render(withIntl(<PaymentsTabs />));
}

describe('PaymentsTabs — boutons de création gardés par capacité (TCK-528)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lit exactement invoices.create et payouts.create', () => {
    accorder([]);
    rendre();

    const lues = vi.mocked(useCan).mock.calls.map(([capability]) => capability);
    expect(new Set(lues)).toEqual(new Set(['invoices.create', 'payouts.create']));
  });

  it('propose les deux gestes à qui porte les deux capacités (agent, admin d’agence)', () => {
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

  it('ne propose rien à un membre d’agence sans ces capacités (propriétaire)', () => {
    // Le propriétaire porte `properties.update_own` : « avoir une capacité » ne suffit plus.
    accorder(['properties.update_own']);
    rendre();

    expect(screen.queryByRole('button', { name: FACTURER })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: REVERSER })).not.toBeInTheDocument();
  });

  it('ne propose rien et réserve la place tant que les capacités chargent', () => {
    accorder(['invoices.create', 'payouts.create'], true);
    rendre();

    expect(screen.queryByRole('button', { name: FACTURER })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: REVERSER })).not.toBeInTheDocument();
    expect(screen.getByTestId('payments-actions-loading')).toBeInTheDocument();
  });

  it('retire le repère de chargement une fois les capacités arrivées', () => {
    accorder([]);
    rendre();

    expect(screen.queryByTestId('payments-actions-loading')).not.toBeInTheDocument();
  });
});
