import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import { DepositRefundModal } from '../DepositRefundModal';

/**
 * TCK-2330 (P222.05) — la constante de somme du devis vaut aussi pour la caution : trois pièces
 * de 9 Mo, chacune admise (`uploads.*` `max:10240`), dépassent la borne du proxy (25 Mio).
 */
const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));

const MO = 1024 * 1024;

function piece(nom: string, octets: number): File {
  const fichier = new File(['x'], nom, { type: 'application/pdf' });
  Object.defineProperty(fichier, 'size', { value: octets });
  return fichier;
}

function monter() {
  const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <ContexteGardeDoubleFacteur.Provider value={garde}>
        <DepositRefundModal open onOpenChange={vi.fn()} leaseId={5} depositRemaining={100000} currency="XOF" />
      </ContexteGardeDoubleFacteur.Provider>
    </QueryClientProvider>,
  ));
}

describe('<DepositRefundModal> — somme des pièces bornée', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({ data: {} });
  });

  it('trois pièces de 9 Mo sont refusées ensemble, dites, et aucune ne part', async () => {
    monter();
    fireEvent.change(screen.getByLabelText('Justificatifs (photos, factures)'), {
      target: { files: [piece('a.pdf', 9 * MO), piece('b.pdf', 9 * MO), piece('c.pdf', 9 * MO)] },
    });

    expect(screen.getByText('Ces pièces dépassent 24 Mo à elles toutes : retirez-en ou allégez-les.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
    const corps = apiRequestMock.mock.calls[0][1].body as FormData;
    expect(corps.getAll('uploads[]')).toEqual([]);
  });
});
