/**
 * TCK-1293 (P131.04) — l'onglet de la liste des réservations se lit et s'écrit dans `?status=`,
 * borné aux onglets : un lien vers `/app/bookings?status=confirmed` ouvre « Confirmées », et le
 * retour arrière depuis une réservation retrouve l'onglet quitté.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { BookingsList } from '../BookingsList';

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
const lus = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/queries/bookings', () => ({
  useBookings: ({ status }: { status: string }) => {
    lus.push(status);
    return { data: { data: [] }, isLoading: false, isError: false, isSuccess: true, status: 'success', error: null, refetch: vi.fn() };
  },
}));

const onglets = fr.bookings.list.tabs;

describe('BookingsList — onglet porté par l’URL (TCK-1293)', () => {
  beforeEach(() => {
    nav.replace.mockReset();
    lus.length = 0;
  });

  it('ouvre l’onglet que nomme `?status=`', () => {
    nav.query = 'status=confirmed';
    render(withIntl(<BookingsList />));

    expect(screen.getByRole('tab', { name: onglets.confirmed })).toHaveAttribute('aria-selected', 'true');
    expect(lus).toContain('confirmed');
    expect(lus).not.toContain('pending');
  });

  it('retombe sur « En attente » pour une valeur hors des onglets', () => {
    nav.query = 'status=completed';
    render(withIntl(<BookingsList />));

    expect(screen.getByRole('tab', { name: onglets.pending })).toHaveAttribute('aria-selected', 'true');
  });

  it('écrit l’onglet choisi dans l’URL, sans paramètre pour l’onglet par défaut', () => {
    nav.query = 'status=confirmed';
    render(withIntl(<BookingsList />));

    fireEvent.click(screen.getByRole('tab', { name: onglets.rejected }));
    expect(nav.replace).toHaveBeenLastCalledWith('?status=rejected', { scroll: false });

    fireEvent.click(screen.getByRole('tab', { name: onglets.pending }));
    expect(nav.replace).toHaveBeenLastCalledWith('?', { scroll: false });
  });
});
