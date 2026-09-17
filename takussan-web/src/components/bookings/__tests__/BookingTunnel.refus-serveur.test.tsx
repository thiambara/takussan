import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import type { PropertyDetail } from '@/types/property';
import { BookingTunnel } from '../BookingTunnel';

/**
 * TCK-530, vérification adverse — un 422 de `POST /api/bookings` doit se VOIR dans le tunnel.
 *
 * L'API refuse désormais un bien au mois ou à l'année sur `property_id`. Le tunnel le refuse avant,
 * sauf si le bien a changé de période depuis le chargement de la page : l'erreur se posait alors
 * sur `property_id`, champ sans saisie, et l'écran ne montrait rien. Un refus sur `end_date`
 * (`dates_required`, `stay_too_long`) restait lui aussi muet : le retour à l'étape fautive lisait
 * `form.formState.errors`, vide hors rendu.
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

describe('BookingTunnel — refus du serveur (TCK-530)', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 }, isLoading: false } as unknown as ReturnType<typeof useAuth>);
  });

  it('un refus sur property_id s’affiche en erreur globale', async () => {
    const message = 'Ce bien se loue au mois ou à l’année : il relève d’un bail.';
    mutateAsync.mockRejectedValue(
      new ApiError(422, { message, errors: { property_id: [message] } }),
    );

    await soumettre();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
  });

  it('un refus sur end_date ramène à l’étape des dates', async () => {
    const message = 'Indiquez des dates couvrant au moins une nuit.';
    mutateAsync.mockRejectedValue(new ApiError(422, { message, errors: { end_date: [message] } }));

    await soumettre();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuer' })).toBeInTheDocument();
  });
});
