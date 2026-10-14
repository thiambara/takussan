import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { adjustCreditWallet, fetchCreditWallet } from '@/components/boost/admin/api';
import { AdminCreditWalletDetail } from '../AdminCreditWalletDetail';

vi.mock('@/components/boost/admin/api', () => ({
  fetchCreditWallet: vi.fn(),
  adjustCreditWallet: vi.fn(),
}));

function rendre(noeud: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{noeud}</QueryClientProvider>));
}

describe('AdminCreditWalletDetail (TCK-633 lot F, AC16)', () => {
  it('n’ajuste pas sans motif, puis envoie montant et motif', async () => {
    vi.mocked(fetchCreditWallet).mockResolvedValue({
      data: { agency: { id: 7, name: 'Agence Teranga', status: 'active' }, balance: 120, lots: [] },
      movements: [],
      meta: { current_page: 1, last_page: 1, per_page: 25, total: 0 },
    });
    vi.mocked(adjustCreditWallet).mockResolvedValue({ data: { balance: 170, lot: null } });
    const user = userEvent.setup();
    rendre(<AdminCreditWalletDetail agencyId={7} />);

    expect(await screen.findByText('Solde : 120 crédits')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Montant (crédits)'), '50');
    const enregistrer = screen.getByRole('button', { name: 'Enregistrer l’ajustement' });
    expect(enregistrer).toBeDisabled();

    await user.type(screen.getByLabelText('Motif'), 'Geste commercial');
    await user.click(enregistrer);

    await waitFor(() => expect(adjustCreditWallet).toHaveBeenCalledWith(7, { amount: 50, reason: 'Geste commercial' }));
    expect(await screen.findByText('Ajustement enregistré.')).toBeInTheDocument();
  });
});
