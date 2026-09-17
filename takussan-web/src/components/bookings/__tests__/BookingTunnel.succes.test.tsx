import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { useAuth } from '@/context/AuthContext';
import type { PropertyDetail } from '@/types/property';
import { BookingTunnel } from '../BookingTunnel';

/**
 * TCK-530, vérification adverse — l'écran de succès affiche le total ENREGISTRÉ par l'API.
 *
 * Il affichait l'estimation du front (`quoteBooking`), que l'API ne reçoit jamais : si les deux
 * divergeaient (prix modifié entre-temps, règle changée d'un seul côté), l'utilisateur lisait un
 * montant qui n'est pas celui de sa réservation.
 *
 * Montage repris de `BookingTunnel.refus-serveur.test.tsx`.
 */
const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock('react-hook-form', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-hook-form')>()),
  useWatch: () => ({ start_date: '2026-10-01', end_date: '2026-10-04', guests: 1 }),
}));
// Le résolveur laisse tout passer : on éprouve la réponse du serveur, pas la validation locale.
vi.mock('@/hooks/useApiForm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useApiForm')>()),
  useResolveurValidation: () => async (values: unknown) => ({ values, errors: {} }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/queries/bookings', () => ({
  useCreateBooking: () => ({ mutateAsync, isPending: false }),
}));

const bien = {
  id: 7,
  slug: 'bien-7',
  title: 'Appartement Almadies',
  price: 20_000,
  currency: 'XOF',
  contract_type: 'rent',
  rent_period: 'daily',
  rent_period_label: null,
  main_photo_url: null,
  location: { city: 'Dakar' },
  owner: null,
} as unknown as PropertyDetail;

async function soumettre() {
  render(withIntl(<BookingTunnel property={bien} />));
  fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Continuer' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Soumettre la demande' }));
}

describe('BookingTunnel — écran de succès (TCK-530)', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 }, isLoading: false } as unknown as ReturnType<typeof useAuth>);
  });

  it('affiche le total rendu par l’API, pas l’estimation du front', async () => {
    // Estimation du front : 20 000 × 3 nuits = 60 000 F. L'API en a enregistré un autre.
    mutateAsync.mockResolvedValue({
      data: { id: 42, reference_number: 'BK-TEST', total_amount: 45_000, currency: 'XOF' },
    });

    await soumettre();

    const total = await screen.findByTestId('booking-success-total');
    expect(total.textContent?.replace(/\s/g, '')).toBe('45000FCFA');
  });

  it('affiche la devise rendue par l’API', async () => {
    mutateAsync.mockResolvedValue({
      data: { id: 43, reference_number: 'BK-EUR', total_amount: 85.71, currency: 'EUR' },
    });

    await soumettre();

    const total = await screen.findByTestId('booking-success-total');
    expect(total.textContent?.replace(/\s/g, '')).toBe('85,71€');
  });
});
