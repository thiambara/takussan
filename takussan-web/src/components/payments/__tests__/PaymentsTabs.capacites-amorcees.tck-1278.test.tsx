/**
 * TCK-1278 (P136.02) — les capacités que le layout serveur de `/app` a déjà lues pour un
 * administrateur d'agence amorcent le cache du navigateur : les gestes de `/app/payments`
 * s'affichent au premier rendu, sans squelette ni second `GET /api/me/capabilities`.
 *
 * Ici, rien n'est simulé entre la clé et le bouton : `useCan` → `useMyCapabilities` →
 * `useApiQuery` sont les vrais ; seul `apiRequest` est espionné.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { AmorceCapacites } from '@/components/providers/AmorceCapacites';
import { PaymentsTabs } from '../PaymentsTabs';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 9, roles: ['agency_admin'] } }),
}));
vi.mock('../OwnerStatementPanel', () => ({ OwnerStatementPanel: () => null }));
vi.mock('../ServiceProviderBillsTable', () => ({ ServiceProviderBillsTable: () => null }));
vi.mock('../PaymentsHistoryFilters', () => ({ PaymentsHistoryFilters: () => null }));
vi.mock('../PaymentsHistoryTable', () => ({ PaymentsHistoryTable: () => null }));
vi.mock('../InvoicesTable', () => ({ InvoicesTable: () => null }));
vi.mock('../PayoutsTable', () => ({ PayoutsTable: () => null }));
vi.mock('../CreateInvoiceDialog', () => ({ CreateInvoiceDialog: () => null }));
vi.mock('../CreatePayoutDialog', () => ({ CreatePayoutDialog: () => null }));
vi.mock('../InvoiceDetailDialog', () => ({ InvoiceDetailDialog: () => null }));
vi.mock('../PayoutDetailDialog', () => ({ PayoutDetailDialog: () => null }));

function rendre(lecture: Parameters<typeof AmorceCapacites>[0]['lecture']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <AmorceCapacites lecture={lecture}>
          <PaymentsTabs />
        </AmorceCapacites>
      </QueryClientProvider>,
    ),
  );
  return client;
}

const appelsDesCapacites = () =>
  apiRequest.mock.calls.filter(([chemin]) => String(chemin).startsWith('/api/me/capabilities'));

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockReturnValue(new Promise(() => {}));
});

describe('PaymentsTabs sous un cache amorcé par le layout (TCK-1278, P136.02)', () => {
  it('les gestes s’affichent au premier rendu, sans relire les capacités', () => {
    const client = rendre({
      reponse: { agency_id: 7, capabilities: ['invoices.create', 'payouts.create', 'payouts.approve'] },
      lueA: Date.now(),
    });

    expect(screen.getByRole('button', { name: fr.payments.actions.createInvoice })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: fr.payments.actions.createPayout })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: fr.payments.tabs.approvals })).toBeInTheDocument();
    expect(screen.queryByTestId('payments-actions-loading')).toBeNull();
    expect(appelsDesCapacites()).toHaveLength(0);
    expect(client.getQueryData(['me', 'capabilities', 'active'])).toEqual({
      data: { agency_id: 7, capabilities: ['invoices.create', 'payouts.create', 'payouts.approve'] },
    });
  });

  it('sans lecture du serveur (agent, panne) : rien n’est amorcé, le navigateur lit comme avant', () => {
    rendre(null);

    expect(screen.getByTestId('payments-actions-loading')).toBeInTheDocument();
    expect(appelsDesCapacites()).toHaveLength(1);
  });
});
