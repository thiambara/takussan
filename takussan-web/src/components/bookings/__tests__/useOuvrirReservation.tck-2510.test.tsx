import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { cheminDuTunnel, lireSejourDemande } from '../tunnel-de-reservation';
import { useOuvrirReservation } from '../useOuvrirReservation';

/**
 * TCK-2510 — « Réserver » d'un séjour court ouvre le tunnel plein écran ; le dossier d'une
 * location au mois et l'offre d'une vente gardent la boîte de la fiche.
 */
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const enveloppe = ({ children }: { children: ReactNode }) => (
  <NextIntlClientProvider locale="en" messages={{}}>
    {children}
  </NextIntlClientProvider>
);

beforeEach(() => push.mockReset());

describe('useOuvrirReservation (TCK-2510)', () => {
  it.each(['daily', 'weekly'] as const)('%s : le tunnel, dans la langue de la page', (rent_period) => {
    const boite = vi.fn();
    const { result } = renderHook(() => useOuvrirReservation({ slug: 'studio-ngor', contract_type: 'rent', rent_period }, boite), {
      wrapper: enveloppe,
    });
    result.current();
    expect(push).toHaveBeenCalledWith('/en/bookings?property=studio-ngor');
    expect(boite).not.toHaveBeenCalled();
  });

  it.each([
    ['rent', 'monthly'],
    ['rent', 'yearly'],
    ['rent', null],
    ['sale', null],
  ] as const)('%s / %s : la boîte de la fiche', (contract_type, rent_period) => {
    const boite = vi.fn();
    const { result } = renderHook(() => useOuvrirReservation({ slug: 'x', contract_type, rent_period }, boite), { wrapper: enveloppe });
    result.current();
    expect(boite).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('l’adresse du tunnel (TCK-2510)', () => {
  it('aller-retour : les dates et les personnes survivent à l’URL', () => {
    const chemin = cheminDuTunnel('studio-ngor', { debut: '2026-12-13', fin: '2026-12-16', personnes: 3 });
    expect(chemin).toBe('/bookings?property=studio-ngor&debut=2026-12-13&fin=2026-12-16&personnes=3');
    const params = Object.fromEntries(new URL(chemin, 'https://x.invalid').searchParams);
    expect(lireSejourDemande(params)).toEqual({ debut: '2026-12-13', fin: '2026-12-16', personnes: 3 });
  });

  it.each([
    [{ debut: '2026-02-31', fin: '2026-03-02' }, { debut: null, fin: null, personnes: 1 }],
    [{ debut: '2026-12-16', fin: '2026-12-13' }, { debut: '2026-12-16', fin: null, personnes: 1 }],
    [{ debut: '2026-12-13', fin: '2026-12-13' }, { debut: '2026-12-13', fin: null, personnes: 1 }],
    [{ debut: ['2026-12-13'], personnes: '21' }, { debut: null, fin: null, personnes: 1 }],
    [{ debut: 'demain', personnes: '0' }, { debut: null, fin: null, personnes: 1 }],
    [{ personnes: '20' }, { debut: null, fin: null, personnes: 20 }],
  ])('lecture prudente de %j', (params, attendu) => {
    expect(lireSejourDemande(params as Record<string, string | string[]>)).toEqual(attendu);
  });
});
