/**
 * TCK-2892 (ADR-0110 § 1) — le nombre de voyageurs n'appartient qu'à un séjour : l'API le refuse à
 * une candidature (422 `booking.field_not_for_kind`). La boîte ne le montre ni ne l'envoie hors
 * d'une location à la nuit ou à la semaine.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { PropertyReservationDialog } from '../PropertyReservationDialog';

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value, onValueChange, placeholder }: { value?: string; onValueChange: (v: string) => void; placeholder?: string }) => (
    <input aria-label={placeholder} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: vi.fn(async () => ({ data: [] })),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 5 }, token: null, isLoading: false }),
}));
const soumettre = vi.fn(async (_donnees: unknown) => undefined);
vi.mock('@/hooks/useBookingRequest', () => ({
  useBookingRequest: () => ({ submit: soumettre, submitting: false, error: null }),
}));
vi.mock('@/app/actions/property', () => ({ submitPurchaseOffer: vi.fn() }));

function ouvrir(rent_period: PropertyDetail['rent_period']): void {
  const bien = { id: 7, slug: 'studio-almadies', title: 'Studio', price: 20_000, currency: 'XOF', contract_type: 'rent', rent_period } as unknown as PropertyDetail;
  render(withIntl(<PropertyReservationDialog property={bien} open onOpenChange={() => {}} />));
  fireEvent.submit(document.querySelector('form') as HTMLFormElement);
}

afterEach(() => soumettre.mockClear());

describe('le nombre de voyageurs (TCK-2892)', () => {
  it('une candidature au mois ne montre ni n’envoie de voyageurs', async () => {
    ouvrir('monthly');

    expect(screen.queryByText('Invités')).toBeNull();
    await waitFor(() => expect(soumettre).toHaveBeenCalledTimes(1));
    expect(soumettre.mock.calls[0]?.[0]).not.toHaveProperty('guests');
  });

  it('un séjour à la nuit les montre et les envoie', async () => {
    ouvrir('daily');

    expect(screen.getByText('Invités')).toBeTruthy();
    await waitFor(() => expect(soumettre).toHaveBeenCalledTimes(1));
    expect(soumettre.mock.calls[0]?.[0]).toMatchObject({ guests: 1 });
  });
});
