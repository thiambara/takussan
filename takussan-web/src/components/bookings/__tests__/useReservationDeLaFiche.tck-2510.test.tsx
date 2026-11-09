import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReservationDeLaFiche } from '../useReservationDeLaFiche';

/**
 * TCK-2510 (revue, mineur 4) — un seul parcours de réservation par bien. Le retour de connexion
 * `?action=reserver&debut=&fin=` (TCK-589) d'un bien à la nuit ou à la semaine mène au TUNNEL, dates
 * reprises — plus à la boîte de la fiche, qui reste celle du dossier au mois et de l'offre d'achat.
 */
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const enveloppe = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="fr" messages={{}}>
    {children}
  </NextIntlClientProvider>
);

function arriverSur(recherche: string) {
  window.history.replaceState(null, '', `/fr/properties/studio-ngor${recherche}`);
}

beforeEach(() => push.mockReset());
afterEach(() => arriverSur(''));

describe('useReservationDeLaFiche (TCK-2510)', () => {
  it('séjour court + `?action=reserver` : le tunnel, avec les dates rapportées ; la boîte ne s’ouvre pas', () => {
    arriverSur('?action=reserver&debut=2026-12-13&fin=2026-12-16');
    const boite = vi.fn();
    renderHook(() => useReservationDeLaFiche({ slug: 'studio-ngor', contract_type: 'rent', rent_period: 'daily' }, true, boite), {
      wrapper: enveloppe,
    });

    expect(push).toHaveBeenCalledWith('/fr/bookings?property=studio-ngor&debut=2026-12-13&fin=2026-12-16');
    expect(boite).not.toHaveBeenCalled();
    expect(window.location.search).toBe(''); // l'intention est consommée
  });

  it('location au mois + `?action=reserver` : la boîte se rouvre, l’intention lui est rendue', () => {
    arriverSur('?action=reserver&debut=2026-12-13&fin=2026-12-16');
    const boite = vi.fn();
    const { result } = renderHook(
      () => useReservationDeLaFiche({ slug: 'studio-ngor', contract_type: 'rent', rent_period: 'monthly' }, true, boite),
      { wrapper: enveloppe },
    );

    expect(boite).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(result.current.intention).toEqual({ debut: '2026-12-13', fin: '2026-12-16' });
  });

  it('session pas encore lue : rien ne part (TCK-589)', () => {
    arriverSur('?action=reserver&debut=2026-12-13&fin=2026-12-16');
    renderHook(() => useReservationDeLaFiche({ slug: 'studio-ngor', contract_type: 'rent', rent_period: 'daily' }, false, vi.fn()), {
      wrapper: enveloppe,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('« Réserver » sans intention : le tunnel nu, quel que soit l’argument du clic', () => {
    arriverSur('');
    const { result } = renderHook(
      () => useReservationDeLaFiche({ slug: 'studio-ngor', contract_type: 'rent', rent_period: 'weekly' }, true, vi.fn()),
      { wrapper: enveloppe },
    );
    (result.current.ouvrir as (e?: unknown) => void)({ type: 'click', debut: 'piège' });
    expect(push).toHaveBeenCalledWith('/fr/bookings?property=studio-ngor');
  });
});
