/**
 * TCK-1735 (P167.05) — sous « Mes chiffres », « Demandes en attente » compte les réservations des
 * biens de l'agent : son lien porte `?only_mine=1`, que la liste lit, envoie à l'API et montre par
 * une case « Mes biens » qu'on peut décocher. Sans le paramètre, la liste est celle d'avant.
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
const lus = vi.hoisted(() => [] as Array<{ status: string; onlyMine?: boolean }>);
vi.mock('@/lib/queries/bookings', () => ({
  useBookings: (params: { status: string; onlyMine?: boolean }) => {
    lus.push(params);
    return { data: { data: [] }, isLoading: false, isError: false, isSuccess: true, status: 'success', error: null, refetch: vi.fn() };
  },
}));

describe('BookingsList — la portée « Mes biens » (TCK-1735)', () => {
  beforeEach(() => {
    nav.replace.mockReset();
    lus.length = 0;
  });

  it('lit `?only_mine=1`, l’envoie, et la montre cochée', () => {
    nav.query = 'only_mine=1';
    render(withIntl(<BookingsList />));

    expect(lus.every((p) => p.onlyMine === true)).toBe(true);
    expect(screen.getByRole('checkbox', { name: fr.bookings.list.onlyMine })).toBeChecked();
  });

  it('se décoche, et l’URL la perd en gardant l’onglet', () => {
    nav.query = 'status=confirmed&only_mine=1';
    render(withIntl(<BookingsList />));

    fireEvent.click(screen.getByRole('checkbox', { name: fr.bookings.list.onlyMine }));
    expect(nav.replace).toHaveBeenLastCalledWith('?status=confirmed', { scroll: false });
  });

  it('sans le paramètre, ni portée ni case', () => {
    nav.query = '';
    render(withIntl(<BookingsList />));

    expect(lus.every((p) => !p.onlyMine)).toBe(true);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
