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

  it('TCK-822 : une clé d’idempotence par ouverture et par offre, stable tant que le dialogue reste ouvert', async () => {
    etat(100);
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const vue = render(withIntl(<BoostDialog propertyId={47} propertyTitle="Studio" open onOpenChange={onOpenChange} />));
    const cle = () => vi.mocked(useBuyBoost).mock.calls.at(-1)?.[1];

    await user.click(screen.getByRole('button', { name: /Vedette 7 jours/ }));
    const premiere = cle();
    expect(premiere).toEqual(expect.stringMatching(/\S{8,}/));
    vue.rerender(withIntl(<BoostDialog propertyId={47} propertyTitle="Studio" open onOpenChange={onOpenChange} />));
    expect(cle()).toBe(premiere);

    await user.click(screen.getByRole('button', { name: /Remontée/ }));
    expect(cle()).not.toBe(premiere);

    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    vue.rerender(withIntl(<BoostDialog propertyId={47} propertyTitle="Studio" open onOpenChange={onOpenChange} />));
    await user.click(screen.getByRole('button', { name: /Vedette 7 jours/ }));
    expect(cle()).not.toBe(premiere);
  });

  // Contre-vérification de TCK-2664 — après un refus `credits.insufficient`, le refus fait foi jusqu'à
  // ce que la relecture des crédits RÉUSSISSE. `refetch()` se résout aussi sur un échec : effacer le
  // refus à ce moment rendait la parole au solde d'avant (« Il vous restera » revenait, Confirmer
  // se rouvrait sur un achat que le serveur venait de refuser).
  describe('le refus « solde insuffisant » et la relecture des crédits', () => {
    const refus = { status: 422, data: { code: 'credits.insufficient', params: { missing: 8, balance: 12 } } };

    async function refuserPuisRelire(relu: { isSuccess: boolean; isError: boolean }) {
      etat(100);
      const reset = vi.fn();
      const refetch = vi.fn(() => Promise.resolve(relu));
      vi.mocked(useCredits).mockReturnValue({ data: { data: { balance: 100, lots: [] }, movements: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } }, isLoading: false, isError: false, refetch } as never);
      vi.mocked(useBuyBoost).mockReturnValue({ mutate, isPending: false, error: null, reset } as never);
      // `beforeEach(() => mutate.mockReset())` rend le mock, que vitest rappelle SANS argument en nettoyage.
      mutate.mockImplementation((_v?: unknown, o?: { onError: (e: unknown) => void }) => o?.onError(refus));
      const user = userEvent.setup();
      ouvrir();
      await user.click(screen.getByRole('button', { name: /Vedette 7 jours/ }));
      await user.click(screen.getByRole('button', { name: 'Confirmer' }));
      await vi.waitFor(() => expect(refetch).toHaveBeenCalled());
      await Promise.resolve();
      await Promise.resolve();
      return reset;
    }

    it('relecture réussie : le refus s’efface, le solde relu parle', async () => {
      const reset = await refuserPuisRelire({ isSuccess: true, isError: false });
      await vi.waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
    });

    it('relecture échouée : le refus reste, l’ancien solde ne revient pas', async () => {
      const reset = await refuserPuisRelire({ isSuccess: false, isError: true });
      await new Promise((r) => setTimeout(r, 20));
      expect(reset).not.toHaveBeenCalled();
    });
  });
});
