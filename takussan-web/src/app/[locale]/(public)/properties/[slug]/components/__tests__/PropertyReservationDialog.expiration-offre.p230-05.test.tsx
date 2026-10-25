/**
 * P230.05 (TCK-2236) — l'expiration d'une offre d'achat part du lendemain du jour de l'API
 * (`BookingRequestPublicPropertyRequest` : `offer_expires_at` `after:today`). Calculée par
 * `setDate()` local puis relue par `toISOString()`, elle tombait le jour UTC lui-même à Paris, à
 * 00:00 Z le 29 mars 2026 (passage à l'heure d'été) : un jour que l'API refuse.
 */
process.env.TZ = 'Europe/Paris';

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { PropertyReservationDialog } from '../PropertyReservationDialog';

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value, onValueChange, placeholder, min }: {
    value?: string;
    onValueChange: (v: string) => void;
    placeholder?: string;
    min?: string;
  }) => (
    <input aria-label={placeholder} value={value ?? ''} min={min} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 5 }, token: null, isLoading: false }),
}));
vi.mock('@/hooks/useBookingRequest', () => ({
  useBookingRequest: () => ({ submit: vi.fn(), submitting: false, error: null }),
}));
vi.mock('@/app/actions/property', () => ({ submitPurchaseOffer: vi.fn() }));

const bien = {
  id: 7,
  slug: 'villa-ngor',
  title: 'Villa Ngor',
  price: 50_000_000,
  currency: 'XOF',
  contract_type: 'sale',
  owner: { id: 3, name: 'Awa', slug: 'awa', avatar_url: null, is_agent: true, member_since: null },
} as unknown as PropertyDetail;

describe('OfferForm — expiration minimale (P230.05)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-29T00:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('le premier jour offert est le lendemain du jour UTC', () => {
    render(withIntl(<PropertyReservationDialog property={bien} open onOpenChange={() => {}} />));

    expect(screen.getByLabelText("Date d'expiration")).toHaveAttribute('min', '2026-03-30');
  });
});
