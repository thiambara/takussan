import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { useBoostProducts, useBuyBoost, useCredits } from '@/components/boost/api';
import { BoostDialog } from '../BoostDialog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/boost/api', () => ({
  useCredits: vi.fn(),
  useBoostProducts: vi.fn(),
  useBuyBoost: vi.fn(),
}));

const OFFRES = [
  { id: 1, kind: 'bump', variant: null, duration_days: 0, price_credits: 5, is_active: true, sort_order: 10 },
  { id: 2, kind: 'featured', variant: null, duration_days: 7, price_credits: 20, is_active: true, sort_order: 20 },
] as const;

const mutate = vi.fn();

function etat(balance: number) {
  vi.mocked(useCredits).mockReturnValue({ data: { data: { balance, lots: [] }, movements: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } }, isLoading: false, isError: false, refetch: vi.fn() } as never);
  vi.mocked(useBoostProducts).mockReturnValue({ data: { data: OFFRES }, isLoading: false, isError: false, refetch: vi.fn() } as never);
  vi.mocked(useBuyBoost).mockReturnValue({ mutate, isPending: false, error: null, reset: vi.fn() } as never);
}

function ouvrir() {
  render(withIntl(<BoostDialog propertyId={47} propertyTitle="Studio à Ouakam" open onOpenChange={vi.fn()} />));
}

describe('BoostDialog (TCK-633 lot F)', () => {
  beforeEach(() => mutate.mockReset());

  it('montre le solde, les offres et leur prix', () => {
    etat(12);
    ouvrir();

    expect(screen.getByText('Solde de l’espace : 12 crédits')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Vedette 7 jours/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remontée/ })).toBeInTheDocument();
  });

  it('une offre au-dessus du solde dit ce qui manque et ne se confirme pas — sans bouton d’achat', async () => {
    etat(12);
    const user = userEvent.setup();
    ouvrir();

    await user.click(screen.getByRole('button', { name: /Vedette 7 jours/ }));

    expect(screen.getByText('Il vous manque 8 crédits pour cette offre.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmer' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /acheter/i })).toBeNull();
  });

  it('une offre couverte se confirme', async () => {
    etat(100);
    const user = userEvent.setup();
    ouvrir();

    await user.click(screen.getByRole('button', { name: /Vedette 7 jours/ }));
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    expect(mutate).toHaveBeenCalledWith({ product_id: 2 }, expect.anything());
  });

  it('fermé, il ne demande rien au réseau', () => {
    etat(100);
    render(withIntl(<BoostDialog propertyId={47} propertyTitle="Studio" open={false} onOpenChange={vi.fn()} />));

    expect(vi.mocked(useCredits)).toHaveBeenCalledWith(false);
    expect(vi.mocked(useBoostProducts)).toHaveBeenCalledWith(false);
  });
});
