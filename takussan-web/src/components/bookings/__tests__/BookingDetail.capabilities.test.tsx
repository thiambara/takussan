import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { BookingDetail } from '../BookingDetail';
import { useCanAll } from '@/hooks/useCan';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/lib/queries/bookings';
import { ToastProvider } from '@/components/ui/toast';

vi.mock('@/hooks/useCan', () => ({ useCanAll: vi.fn() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/usePaymentProviders', () => ({
  usePaymentProviders: () => ({ providers: [] }),
}));
vi.mock('@/lib/queries/bookings', () => ({
  useBooking: vi.fn(),
  useCancelBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const BOOKING = {
  id: 1,
  agency_id: 5,
  status: 'pending',
  reference_number: 'BK-1',
  property: { id: 2, title: 'Villa', slug: 'villa' },
  customer: { user_id: 999 },
  payments: [],
  notes: null,
};

/**
 * `useCanAll` reçoit une liste figée par capacité (`CAPABILITY_VALIDATE`…),
 * donc le premier élément identifie sans ambiguïté quel bouton est en jeu.
 */
function grant(granted: readonly string[], isLoading = false) {
  vi.mocked(useCanAll).mockImplementation((capabilities) => ({
    can: capabilities.every((c) => granted.includes(c)),
    isLoading,
  }));
}

function renderDetail() {
  // `useToast` s'appuie sur le provider base-ui — `vitest.setup.ts` n'en
  // monte aucun (cf. `src/test/intl.tsx`).
  render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={1} />
      </ToastProvider>,
    ),
  );
}

describe('BookingDetail — gates par capacité (TCK-279 AC12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBooking).mockReturnValue({
      data: { data: BOOKING },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useBooking>);
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 3, roles: ['agency_admin'] },
      token: 'tok',
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('montre « Accepter » et « Refuser » avec bookings.validate', () => {
    grant(['bookings.validate']);
    renderDetail();

    expect(screen.getByRole('button', { name: 'Accepter' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument();
  });

  it('les masque à un agency_admin dont le rôle n’a PAS bookings.validate', () => {
    grant([]);
    renderDetail();

    // C'est exactement la régression que TCK-279 introduit et qu'AC12 ferme :
    // « être agency_admin » ne dit plus ce qu'on a le droit de faire.
    expect(screen.queryByRole('button', { name: 'Accepter' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull();
  });

  it('sépare bookings.cancel de bookings.validate', () => {
    grant(['bookings.cancel']);
    renderDetail();

    expect(screen.getByRole('button', { name: 'Annuler la réservation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accepter' })).toBeNull();
  });

  it('laisse le verdict d’appartenance tenir pendant le chargement', () => {
    grant([], true);
    renderDetail();

    // `can` vaut `false` tant que la réponse n'est pas là. S'y fier ferait
    // DISPARAÎTRE le bouton puis le ferait réapparaître — pire qu'un bouton
    // désactivé, et un clic perdu au passage.
    expect(screen.getByRole('button', { name: 'Accepter' })).toBeInTheDocument();
  });

  it('ne montre rien de tout cela à un simple client, même « autorisé »', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 999, roles: ['customer'] },
      token: 'tok',
    } as unknown as ReturnType<typeof useAuth>);
    grant(['bookings.validate', 'bookings.cancel', 'payments.record']);
    renderDetail();

    // La capacité ne remplace pas l'appartenance : le client garde ses
    // propres gestes (annuler SA réservation), pas ceux du personnel.
    expect(screen.queryByRole('button', { name: 'Accepter' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refuser' })).toBeNull();
  });
});
