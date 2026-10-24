import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import { DepositRefundModal } from '../DepositRefundModal';

/**
 * TCK-2148 (P222.04) — `RefundDepositRequest` borne `uploads` à 10 pièces de 10 Mo
 * (`max:10`, `uploads.*` `max:10240`). La modale envoyait tout ce que le sélecteur rendait : le
 * refus n'arrivait qu'après l'envoi, sur toute la restitution.
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

function choisir(fichiers: File[]) {
  fireEvent.change(screen.getByLabelText('Justificatifs (photos, factures)'), { target: { files: fichiers } });
}

async function envoyer(): Promise<File[]> {
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le remboursement' }));
  await waitFor(() => expect(apiRequestMock).toHaveBeenCalledTimes(1));
  const corps = apiRequestMock.mock.calls[0][1].body as FormData;
  return corps.getAll('uploads[]') as File[];
}

describe('<DepositRefundModal> — pièces bornées au choix', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({ data: {} });
  });

  it('une pièce de 11 Mo est écartée, nommée, et ne part pas', async () => {
    monter();
    const petite = piece('facture.pdf', 200_000);
    choisir([piece('photo-lourde.pdf', 11 * MO), petite]);

    expect(screen.getByText('Fichier trop lourd (10 Mo au plus) : photo-lourde.pdf')).toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalled();
    expect(await envoyer()).toEqual([petite]);
  });

  it('onze pièces sont refusées et dites, et aucune ne part', async () => {
    monter();
    choisir(Array.from({ length: 11 }, (_, i) => piece(`piece-${i}.pdf`, 1000)));

    expect(screen.getByText('Maximum 10 fichiers.')).toBeInTheDocument();
    expect(await envoyer()).toEqual([]);
  });

  it('une pièce de 10 Mo exactement est gardée, sans alerte', async () => {
    monter();
    const juste = piece('bail.pdf', 10 * MO);
    choisir([juste]);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await envoyer()).toEqual([juste]);
  });
});
