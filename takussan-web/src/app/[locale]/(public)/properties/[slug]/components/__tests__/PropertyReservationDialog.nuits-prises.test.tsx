import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { PropertyReservationDialog } from '../PropertyReservationDialog';

/**
 * TCK-596 §3B (ADR-0041) — le tunnel public grise les nuits déjà prises, lues sur l'API publique ;
 * un refus du serveur s'affiche quand même.
 *
 * Le sélecteur est remplacé par un champ qui expose son prédicat `isDateDisabled` : c'est la règle
 * des nuits qu'on éprouve, pas le calendrier.
 */
const etat = vi.hoisted(() => ({
  pickers: {} as Record<string, { isDateDisabled?: (d: string) => boolean; onValueChange: (v: string) => void }>,
  apiFetch: vi.fn(),
  error: null as string | null,
}));

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: (props: {
    value?: string;
    onValueChange: (v: string) => void;
    placeholder?: string;
    isDateDisabled?: (d: string) => boolean;
  }) => {
    etat.pickers[props.placeholder ?? ''] = props;
    return <input aria-label={props.placeholder} value={props.value ?? ''} onChange={(e) => props.onValueChange(e.target.value)} />;
  },
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: etat.apiFetch,
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 5 }, token: null, isLoading: false }),
}));
vi.mock('@/hooks/useBookingRequest', () => ({
  useBookingRequest: () => ({ submit: vi.fn(), submitting: false, error: etat.error }),
}));
vi.mock('@/app/actions/property', () => ({ submitPurchaseOffer: vi.fn() }));

function bien(rent_period: PropertyDetail['rent_period']): PropertyDetail {
  return {
    id: 7,
    slug: 'villa-saly',
    title: 'Villa Saly',
    price: 20_000,
    currency: 'XOF',
    contract_type: 'rent',
    rent_period,
  } as unknown as PropertyDetail;
}

const ARRIVEE = "Date d'arrivée";
const DEPART = 'Date de départ';

function ouvrir(rent_period: PropertyDetail['rent_period'] = 'daily') {
  render(withIntl(<PropertyReservationDialog property={bien(rent_period)} open onOpenChange={() => {}} />));
}

describe('PropertyReservationDialog — nuits prises (TCK-596 §3B)', () => {
  beforeEach(() => {
    etat.pickers = {};
    etat.error = null;
    etat.apiFetch.mockReset();
    etat.apiFetch.mockResolvedValue({
      data: { from: '2026-10-08', to: '2027-04-08', occupied: [{ start: '2026-11-10', end: '2026-11-13' }] },
    });
  });

  it('lit les nuits du bien sur l’API publique', async () => {
    ouvrir();

    await waitFor(() => expect(etat.apiFetch).toHaveBeenCalledWith('/public/properties/villa-saly/availability'));
  });

  it('grise une arrivée sur une nuit prise, pas le jour du départ', async () => {
    ouvrir();
    await screen.findByTestId('reservation-occupied-hint');

    const arrivee = etat.pickers[ARRIVEE].isDateDisabled!;
    expect(arrivee('2026-11-10')).toBe(true);
    expect(arrivee('2026-11-12')).toBe(true);
    expect(arrivee('2026-11-13')).toBe(false);
    expect(arrivee('2026-11-09')).toBe(false);
  });

  it('grise un départ qui franchirait une nuit prise, pas celui du jour d’arrivée', async () => {
    ouvrir();
    await screen.findByTestId('reservation-occupied-hint');

    etat.pickers[ARRIVEE].onValueChange('2026-11-07');
    await waitFor(() => expect(etat.pickers[DEPART].isDateDisabled!('2026-11-11')).toBe(true));
    expect(etat.pickers[DEPART].isDateDisabled!('2026-11-10')).toBe(false);
    expect(etat.pickers[DEPART].isDateDisabled!('2026-11-20')).toBe(true);
  });

  it('une location au mois ne lit pas de nuits', () => {
    ouvrir('monthly');

    expect(etat.apiFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('reservation-occupied-hint')).not.toBeInTheDocument();
  });

  it('affiche le refus du serveur', () => {
    etat.error = 'Ces dates ne sont pas disponibles pour ce bien.';
    ouvrir();

    expect(screen.getByRole('alert')).toHaveTextContent('Ces dates ne sont pas disponibles pour ce bien.');
  });
});
