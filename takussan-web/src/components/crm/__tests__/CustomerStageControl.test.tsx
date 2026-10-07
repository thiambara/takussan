/**
 * TCK-591 §2 — l'étape se change depuis la fiche, sans glisser : une étape ordinaire part tout de
 * suite, « perdu » demande son motif et l'envoie.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { CustomerStageControl } from '../CustomerStageControl';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const patchCustomerPipelineStage = vi.fn();
vi.mock('@/lib/queries/pipeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/pipeline')>()),
  patchCustomerPipelineStage: (...a: unknown[]) => patchCustomerPipelineStage(...a),
}));

function rendu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <CustomerStageControl customerId={9} name="Awa Diop" stage="prospect" />
    </QueryClientProvider>,
  ));
}

describe('CustomerStageControl', () => {
  beforeEach(() => {
    patchCustomerPipelineStage.mockReset();
    refresh.mockReset();
    patchCustomerPipelineStage.mockResolvedValue({});
  });

  it('une étape ordinaire part tout de suite, puis la fiche se relit', async () => {
    rendu();
    await userEvent.selectOptions(screen.getByLabelText('Étape de Awa Diop'), 'qualified');
    await waitFor(() => expect(patchCustomerPipelineStage).toHaveBeenCalledWith('jeton', 9, 'qualified', undefined));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('« perdu » demande le motif, et l’envoie', async () => {
    rendu();
    await userEvent.selectOptions(screen.getByLabelText('Étape de Awa Diop'), 'lost');
    expect(patchCustomerPipelineStage).not.toHaveBeenCalled();
    await userEvent.type(await screen.findByTestId('reason-input'), 'Budget');
    await userEvent.click(screen.getByTestId('reason-submit'));
    await waitFor(() => expect(patchCustomerPipelineStage).toHaveBeenCalledWith('jeton', 9, 'lost', 'Budget'));
  });
});
