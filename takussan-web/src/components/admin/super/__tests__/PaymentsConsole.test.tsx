import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchPaymentSummary,
  fetchPaymentSupervision,
  fetchWebhookLogs,
  replayWebhookLog,
} from '@/lib/queries/super-admin';
import type { WebhookLog } from '@/types/super-admin';
import { withIntl } from '@/test/intl';
import { PaymentsConsole } from '../payments';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchPaymentSummary: vi.fn(),
  fetchPaymentSupervision: vi.fn(),
  fetchWebhookLogs: vi.fn(),
  replayWebhookLog: vi.fn(),
}));

const meta = { total: 1, current_page: 1, last_page: 1, per_page: 20 };

function log(overrides: Partial<WebhookLog>): WebhookLog {
  return {
    id: 1,
    channel: 'payment',
    provider: 'wave',
    status: 'processed',
    http_status: 200,
    error_code: null,
    external_id: 'cs_1',
    matched_count: 1,
    created_at: '2026-10-08T10:00:00Z',
    replayable: false,
    ...overrides,
  };
}

function renderConsole() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <PaymentsConsole />
    </QueryClientProvider>,
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPaymentSummary).mockResolvedValue({
    data: {
      last_7_days: { wave: { failed: 3, late: 0, unmatched: 3 }, orange_money: { failed: 0, late: 1, unmatched: 0 } },
      last_30_days: { wave: { failed: 5, late: 2, unmatched: 4 }, orange_money: { failed: 0, late: 1, unmatched: 0 } },
    },
  });
  vi.mocked(fetchPaymentSupervision).mockResolvedValue({
    data: [{
      type: 'lease_payment', reason: 'failed', id: 7, reference_number: 'LP-7', status: 'pending', provider: 'wave',
      amount: 150000, currency: 'XOF', agency_id: 3, event_at: '2026-10-07T09:00:00Z', due_date: '2026-10-05',
    }],
    meta,
  });
  vi.mocked(fetchWebhookLogs).mockResolvedValue({
    data: [
      log({ id: 11, status: 'failed', http_status: 500, error_code: 'exception', replayable: true }),
      log({ id: 12, status: 'rejected', http_status: 401, error_code: 'webhook.signature_invalid', replayable: false }),
      log({ id: 13, status: 'processed', matched_count: 0, replayable: true }),
    ],
    meta: { ...meta, total: 3 },
  });
});

describe('<PaymentsConsole> (TCK-602)', () => {
  it('rend les compteurs par fournisseur, et bascule de 7 à 30 jours', async () => {
    const user = userEvent.setup();
    renderConsole();

    const wave = await screen.findByTestId('payments-summary-wave');
    expect(within(wave).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Wave', '3', '0', '3']);

    await user.click(screen.getByRole('button', { name: '30 derniers jours' }));
    expect(within(screen.getByTestId('payments-summary-wave')).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Wave', '5', '2', '4']);
  });

  it('liste les paiements EN ÉCHEC par défaut, et filtre côté serveur', async () => {
    const user = userEvent.setup();
    renderConsole();

    const row = await screen.findByTestId('payment-row-lease_payment-7');
    expect(row.textContent).toContain('LP-7');
    expect(row.textContent).toContain('pending');
    expect(fetchPaymentSupervision).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', provider: undefined }));

    await user.click(screen.getByRole('group', { name: 'Fournisseur' }).querySelector('button[aria-pressed="false"]') as HTMLElement);
    await waitFor(() => expect(fetchPaymentSupervision).toHaveBeenLastCalledWith(expect.objectContaining({ provider: 'wave' })));
  });

  it("ne propose « Rejouer » que sur une ligne rejouable, et rejoue après la phrase de confirmation", async () => {
    vi.mocked(replayWebhookLog).mockResolvedValue({ data: log({ id: 11, status: 'processed', matched_count: 1 }) });
    const user = userEvent.setup();
    renderConsole();

    const failed = await screen.findByTestId('webhook-log-11');
    expect(within(screen.getByTestId('webhook-log-12')).queryByRole('button', { name: /Rejouer/ })).toBeNull();
    expect(within(screen.getByTestId('webhook-log-13')).getByText('Non apparié')).toBeTruthy();

    await user.click(within(failed).getByRole('button', { name: /Rejouer/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox'), 'REJOUER');
    await user.click(within(dialog).getByRole('button', { name: /Rejouer/ }));

    await waitFor(() => expect(replayWebhookLog).toHaveBeenCalledWith(11));
    expect((await screen.findByTestId('webhook-replay-outcome')).textContent).toContain('Traité');
  });

  it('lit le journal des paiements par défaut, et filtre les non appariés côté serveur', async () => {
    const user = userEvent.setup();
    renderConsole();
    await screen.findByTestId('webhook-log-11');
    expect(fetchWebhookLogs).toHaveBeenLastCalledWith(expect.objectContaining({ channel: 'payment', unmatched: false }));

    await user.click(screen.getByRole('button', { name: 'Non appariés seulement' }));
    await waitFor(() => expect(fetchWebhookLogs).toHaveBeenLastCalledWith(expect.objectContaining({ unmatched: true })));
  });
});
