import { render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { PropertyReservationDialog, useIntentionDeReservation } from '../PropertyReservationDialog';

/**
 * TCK-589 — le visiteur sans compte n'a plus qu'une porte : « Se connecter » ET « Créer un
 * compte » ramènent à la fiche, boîte rouverte (`?action=reserver&debut=&fin=`), dates reprises.
 */
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value, onValueChange, placeholder }: {
    value?: string;
    onValueChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <input aria-label={placeholder} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));
let utilisateur: { id: number } | null = null;
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: utilisateur, token: null, isLoading: false }),
}));
vi.mock('@/hooks/useBookingRequest', () => ({
  useBookingRequest: () => ({ submit: vi.fn(), submitting: false, error: null }),
}));
vi.mock('@/app/actions/property', () => ({ submitPurchaseOffer: vi.fn() }));

const bien = {
  id: 7,
  slug: 'villa-ngor',
  title: 'Villa Ngor',
  price: 20_000,
  currency: 'XOF',
  contract_type: 'rent',
  rent_period: 'daily',
  owner: { id: 3, name: 'Awa', slug: 'awa', avatar_url: null, is_agent: true, member_since: null },
} as unknown as PropertyDetail;

const RETOUR = encodeURIComponent('/properties/villa-ngor?action=reserver&debut=2099-01-10&fin=2099-01-14');

beforeEach(() => {
  utilisateur = null;
});

describe('branche anonyme', () => {
  it('« Créer un compte » et « Se connecter » portent l’intention de réserver, dates comprises', () => {
    render(
      withIntl(
        <PropertyReservationDialog
          property={bien}
          open
          onOpenChange={() => {}}
          intention={{ debut: '2099-01-10', fin: '2099-01-14' }}
        />,
      ),
    );
    expect(screen.getByRole('link', { name: 'Créer un compte' }).getAttribute('href')).toBe(
      `/auth/register?redirect=${RETOUR}`,
    );
    expect(screen.getByRole('link', { name: 'Se connecter' }).getAttribute('href')).toBe(
      `/auth/login?redirect=${RETOUR}`,
    );
  });
});

describe('réouverture par l’intention', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('connecté, l’intention pré-remplit les dates du formulaire', () => {
    utilisateur = { id: 5 };
    render(
      withIntl(
        <PropertyReservationDialog
          property={bien}
          open
          onOpenChange={() => {}}
          intention={{ debut: '2099-01-10', fin: '2099-01-14' }}
        />,
      ),
    );
    expect(screen.getByLabelText("Date d'arrivée")).toHaveValue('2099-01-10');
    expect(screen.getByLabelText('Date de départ')).toHaveValue('2099-01-14');
  });

  it('une date passée ne se pré-remplit pas', () => {
    utilisateur = { id: 5 };
    render(
      withIntl(
        <PropertyReservationDialog
          property={bien}
          open
          onOpenChange={() => {}}
          intention={{ debut: '2001-01-10', fin: '2001-01-14' }}
        />,
      ),
    );
    expect(screen.getByLabelText("Date d'arrivée")).toHaveValue('');
    expect(screen.getByLabelText('Date de départ')).toHaveValue('');
  });

  it('?action=reserver rouvre la boîte une fois, rend les dates et nettoie l’URL', () => {
    window.history.replaceState(null, '', '/fr/properties/villa-ngor?action=reserver&debut=2099-01-10&fin=2099-01-14&ref=wa');
    const ouvrir = vi.fn();
    const { result } = renderHook(() => useIntentionDeReservation(true, ouvrir));
    expect(ouvrir).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ debut: '2099-01-10', fin: '2099-01-14' });
    expect(window.location.pathname + window.location.search).toBe('/fr/properties/villa-ngor?ref=wa');
  });

  it('rien tant que la session charge ; rien sans intention', () => {
    window.history.replaceState(null, '', '/fr/properties/villa-ngor?action=reserver');
    const ouvrir = vi.fn();
    renderHook(() => useIntentionDeReservation(false, ouvrir));
    expect(ouvrir).not.toHaveBeenCalled();

    window.history.replaceState(null, '', '/fr/properties/villa-ngor');
    renderHook(() => useIntentionDeReservation(true, ouvrir));
    expect(ouvrir).not.toHaveBeenCalled();
  });
});
