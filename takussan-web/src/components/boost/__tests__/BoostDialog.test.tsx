import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { useBoostProducts, useBuyBoost, useCredits, usePropertyBoosts } from '@/components/boost/api';
import { BoostDialog } from '../BoostDialog';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/components/boost/api', () => ({
  useCredits: vi.fn(),
  useBoostProducts: vi.fn(),
  useBuyBoost: vi.fn(),
  usePropertyBoosts: vi.fn(),
}));

const OFFRES = [
  { id: 1, kind: 'bump', variant: null, duration_days: 0, price_credits: 5, is_active: true, sort_order: 10 },
  { id: 2, kind: 'featured', variant: null, duration_days: 7, price_credits: 20, is_active: true, sort_order: 20 },
  { id: 3, kind: 'badge', variant: 'price_drop', duration_days: 7, price_credits: 10, is_active: true, sort_order: 30 },
] as const;

const mutate = vi.fn();

function boostVivant(kind: 'featured' | 'badge', extra: Record<string, unknown> = {}) {
  return {
    id: 90, property_id: 47, agency_id: 1, kind, variant: kind === 'badge' ? 'urgent' : null, status: 'active',
    price_credits: 20, duration_days: 7, starts_at: '2099-01-01T10:00:00+00:00', ends_at: '2099-01-08T10:00:00+00:00',
    ended_at: null, remaining_seconds: null, offered: false, offer_reason: null, refunded_credits: null, cancel_reason: null,
    ...extra,
  };
}

function enPlace(boosts: readonly unknown[], bumpAvailableAt: string | null = null) {
  vi.mocked(usePropertyBoosts).mockReturnValue({ data: { data: boosts, bump_available_at: bumpAvailableAt }, isLoading: false, isError: false, refetch: vi.fn() } as never);
}

function etat(balance: number) {
  enPlace([]);
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

  describe('TCK-824 : ce que l’offre choisie fera au boost en place', () => {
    it('lit les boosts du bien à l’ouverture, et rien fermé', () => {
      etat(100);
      ouvrir();
      expect(vi.mocked(usePropertyBoosts)).toHaveBeenCalledWith(47, true);

      render(withIntl(<BoostDialog propertyId={47} propertyTitle="Studio" open={false} onOpenChange={vi.fn()} />));
      expect(vi.mocked(usePropertyBoosts)).toHaveBeenLastCalledWith(47, false);
    });

    it('un badge dit qu’il remplace le badge actif, sans remboursement', async () => {
      etat(100);
      enPlace([boostVivant('badge')]);
      const user = userEvent.setup();
      ouvrir();

      await user.click(screen.getByRole('button', { name: /Baisse de prix/ }));

      expect(screen.getByText(/remplace le badge « Urgent » actif jusqu’au 8 janv\. 2099, sans remboursement/)).toBeInTheDocument();
    });

    it('une Vedette dit jusqu’à quand elle prolonge la Vedette en cours', async () => {
      etat(100);
      enPlace([boostVivant('featured')]);
      const user = userEvent.setup();
      ouvrir();

      await user.click(screen.getByRole('button', { name: /Vedette 7 jours/ }));

      expect(screen.getByText('Prolonge la Vedette en cours jusqu’au 15 janv. 2099.')).toBeInTheDocument();
    });

    it('une Vedette en pause : le nombre de jours ajoutés', async () => {
      etat(100);
      enPlace([boostVivant('featured', { status: 'paused', ends_at: null, remaining_seconds: 3600 })]);
      const user = userEvent.setup();
      ouvrir();

      await user.click(screen.getByRole('button', { name: /Vedette 7 jours/ }));

      expect(screen.getByText('Prolonge de 7 jours la Vedette en pause.')).toBeInTheDocument();
    });

    it('une Remontée encore en délai dit à partir de quand elle est possible', async () => {
      etat(100);
      enPlace([], '2099-03-02T09:30:00+00:00');
      const user = userEvent.setup();
      ouvrir();

      await user.click(screen.getByRole('button', { name: /Remontée/ }));

      expect(screen.getByText(/Remontée possible à partir du 2 mars 2099/)).toBeInTheDocument();
    });

    it('sans boost en place, rien n’est annoncé', async () => {
      etat(100);
      const user = userEvent.setup();
      ouvrir();

      await user.click(screen.getByRole('button', { name: /Vedette 7 jours/ }));
      await user.click(screen.getByRole('button', { name: /Baisse de prix/ }));
      await user.click(screen.getByRole('button', { name: /Remontée/ }));

      expect(screen.queryByText(/remplace|Prolonge|possible à partir/)).toBeNull();
    });
  });
});
