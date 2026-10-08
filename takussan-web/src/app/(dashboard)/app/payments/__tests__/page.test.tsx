/**
 * TCK-593 (Partie 2, AC13) — la page « Paiements » se partage selon le profil.
 *
 * Le client (locataire, acheteur) reçoit sa vue en lecture seule — ce qu'il doit, « Payer », son
 * historique — et AUCUN onglet : ni « Factures », ni « Reversements », vocabulaire de l'agence.
 * Les profils professionnels gardent les trois onglets.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const getMeAction = vi.fn();
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeAction() }));

vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

// Les contenus d'onglet et la vue client ont leurs propres tests ; ils tireraient ici leurs requêtes.
vi.mock('@/components/payments/PaymentsHistoryFilters', () => ({ PaymentsHistoryFilters: () => null }));
vi.mock('@/components/payments/PaymentsHistoryTable', () => ({ PaymentsHistoryTable: () => null }));
vi.mock('@/components/payments/InvoicesTable', () => ({ InvoicesTable: () => null }));
vi.mock('@/components/payments/PayoutsTable', () => ({ PayoutsTable: () => null }));
vi.mock('@/components/payments/CreateInvoiceDialog', () => ({ CreateInvoiceDialog: () => null }));
vi.mock('@/components/payments/CreatePayoutDialog', () => ({ CreatePayoutDialog: () => null }));
vi.mock('@/components/payments/InvoiceDetailDialog', () => ({ InvoiceDetailDialog: () => null }));
vi.mock('@/components/payments/PayoutDetailDialog', () => ({ PayoutDetailDialog: () => null }));
vi.mock('@/components/payments/CustomerPayments', () => ({
  CustomerPayments: () => <div data-testid="vue-client" />,
}));

import Page from '../page';

async function rendre(roles: string[]) {
  getMeAction.mockResolvedValue({ id: 1, roles });
  render(withIntl(await Page()));
}

beforeEach(() => {
  getMeAction.mockReset();
});

describe('/app/payments — vue selon le profil (TCK-593 AC13)', () => {
  it('l’admin d’agence voit les trois onglets', async () => {
    await rendre(['agency_admin']);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.queryByTestId('vue-client')).toBeNull();
  });

  it('le client voit sa vue, sans aucun onglet ni « reversement »', async () => {
    await rendre(['customer']);
    expect(screen.getByTestId('vue-client')).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByText(fr.dashboard.pages.payments.customerSubtitle)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/reversement/i);
  });
});
