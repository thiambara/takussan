import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import { useAuth } from '@/context/AuthContext';
import type { PropertyDetail } from '@/types/property';
import { BookingTunnel } from '../BookingTunnel';

/**
 * TCK-575 — la confirmation d'une demande promettait « Le propriétaire ou l'agent vous recontactera
 * sous 48h ». Aucun mécanisme ne tient cette promesse : le délai est PAR AGENCE
 * (`booking_pending_expiry_hours`, 1 à 168 h, 0 = désactivé), et une seconde échéance
 * (`expires_at`, 7 jours) s'applique à la demande elle-même. L'API rend désormais la première des
 * deux, `response_deadline` (mesurée : 48 h pour l'agence au seuil par défaut, quand `expires_at`
 * disait 7 jours) — c'est elle que l'écran affiche.
 *
 * Montage repris de `BookingTunnel.succes.test.tsx`.
 */
const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock('react-hook-form', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-hook-form')>()),
  useWatch: () => ({ start_date: '2026-10-01', end_date: '2026-10-04', guests: 1 }),
}));
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

const BOUTONS: Record<LocaleDeTest, { continuer: string; soumettre: string }> = {
  fr: { continuer: fr.bookings.tunnel.actions.continue, soumettre: fr.bookings.tunnel.actions.submit },
  en: { continuer: en.bookings.tunnel.actions.continue, soumettre: en.bookings.tunnel.actions.submit },
  wo: { continuer: wo.bookings.tunnel.actions.continue, soumettre: wo.bookings.tunnel.actions.submit },
};

async function soumettre(locale: LocaleDeTest = 'fr') {
  render(withIntl(<BookingTunnel property={bien} />, locale));
  fireEvent.click(screen.getByRole('button', { name: BOUTONS[locale].continuer }));
  fireEvent.click(await screen.findByRole('button', { name: BOUTONS[locale].continuer }));
  fireEvent.click(await screen.findByRole('button', { name: BOUTONS[locale].soumettre }));
}

function reponse(response_deadline: string | null) {
  return { data: { id: 42, reference_number: 'BK-TEST', total_amount: 60_000, currency: 'XOF', response_deadline } };
}

describe('BookingTunnel — le délai annoncé est celui de l’agence (TCK-575)', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    vi.mocked(useAuth).mockReturnValue({ user: { id: 1 }, isLoading: false } as unknown as ReturnType<typeof useAuth>);
  });

  it('affiche l’échéance rendue par l’API, à l’heure de Dakar — et plus « sous 48h »', async () => {
    // Agence au seuil de 12 h : l'ancien texte aurait promis 48 h.
    mutateAsync.mockResolvedValue(reponse('2026-09-24T12:30:00+00:00'));

    await soumettre();

    const echeance = await screen.findByTestId('booking-success-deadline');
    expect(echeance).toHaveTextContent("jusqu'au jeudi 24 septembre 2026");
    expect(echeance).toHaveTextContent('12:30');
    expect(echeance).toHaveTextContent('expire automatiquement');
    expect(document.body.textContent).not.toMatch(/48\s?h/);
  });

  it('suit la locale : en anglais, la même échéance en anglais', async () => {
    mutateAsync.mockResolvedValue(reponse('2026-09-24T12:30:00+00:00'));

    await soumettre('en');

    const echeance = await screen.findByTestId('booking-success-deadline');
    expect(echeance).toHaveTextContent(/has until Thursday,? 24 September 2026/);
    expect(echeance).not.toHaveTextContent(/septembre|jeudi/);
  });

  it('sans échéance (aucun mécanisme ne fera expirer la demande), aucun délai n’est promis', async () => {
    mutateAsync.mockResolvedValue(reponse(null));

    await soumettre();

    const echeance = await screen.findByTestId('booking-success-deadline');
    expect(echeance).toHaveTextContent(fr.bookings.tunnel.success.noDeadline);
    expect(echeance.textContent).not.toMatch(/\d/);
  });

  it('une réponse sans le champ (API antérieure) retombe sur la formulation sans délai', async () => {
    mutateAsync.mockResolvedValue({ data: { id: 43, reference_number: 'BK-OLD', total_amount: 60_000, currency: 'XOF' } });

    await soumettre();

    expect(await screen.findByTestId('booking-success-deadline')).toHaveTextContent(fr.bookings.tunnel.success.noDeadline);
  });

  // Le chiffre ne vient plus du dictionnaire : un « 48 » réécrit dans l'une des trois langues
  // passerait `check-i18n` (la clé existe) et se lirait à l'écran quel que soit le réglage.
  it.each([
    ['fr', fr],
    ['en', en],
    ['wo', wo],
  ] as const)('%s : aucun libellé de la confirmation ne porte de délai chiffré', (_langue, messages) => {
    const { body, deadline, noDeadline } = messages.bookings.tunnel.success;
    for (const libelle of [body, deadline, noDeadline]) {
      expect(libelle).not.toMatch(/\d/);
    }
    expect(deadline).toContain('{date}');
  });
});
