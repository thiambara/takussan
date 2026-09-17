import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { PropertyReservationDialog } from '../PropertyReservationDialog';

/**
 * TCK-535 — la boîte « Réserver / Postuler » de la fiche suit la règle du tunnel (TCK-530).
 *
 * Le sélecteur de dates est remplacé par un champ nu : c'est le calcul qu'on éprouve, pas le
 * calendrier.
 */
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value, onValueChange, placeholder }: {
    value?: string;
    onValueChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <input aria-label={placeholder} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 5 }, token: null, isLoading: false }),
}));
const submit = vi.fn();
vi.mock('@/hooks/useBookingRequest', () => ({
  useBookingRequest: () => ({ submit, submitting: false, error: null }),
}));
vi.mock('@/app/actions/property', () => ({ submitPurchaseOffer: vi.fn() }));

function bien(rent_period: PropertyDetail['rent_period'], price: number): PropertyDetail {
  return {
    id: 7,
    slug: 'bien-7',
    title: 'Appartement Almadies',
    price,
    currency: 'XOF',
    contract_type: 'rent',
    rent_period,
    owner: { id: 3, name: 'Awa', slug: 'awa-agent', avatar_url: null, is_agent: true, member_since: null },
  } as unknown as PropertyDetail;
}

const compact = (text: string | null | undefined) => (text ?? '').replace(/\s/g, '');

function ouvrir(property: PropertyDetail, nuits: number) {
  render(withIntl(<PropertyReservationDialog property={property} open onOpenChange={() => {}} />));
  const arrivee = screen.queryByLabelText("Date d'arrivée");
  if (!arrivee) return;
  fireEvent.change(arrivee, { target: { value: '2026-10-01' } });
  const depart = new Date(Date.UTC(2026, 9, 1 + nuits)).toISOString().slice(0, 10);
  fireEvent.change(screen.getByLabelText('Date de départ'), { target: { value: depart } });
}

describe('PropertyReservationDialog — total selon la période du loyer (TCK-535)', () => {
  beforeEach(() => submit.mockReset());

  it('daily : 20 000 F × 3 nuits → 60 000 F, acompte 18 000 F', () => {
    ouvrir(bien('daily', 20_000), 3);

    const devis = screen.getByTestId('reservation-quote');
    expect(compact(within(devis).getByText('Total estimé').parentElement?.textContent)).toBe(
      compact('Total estimé 60 000 F CFA'),
    );
    expect(compact(within(devis).getByText('Acompte (30 %)').parentElement?.textContent)).toBe(
      compact('Acompte (30 %) 18 000 F CFA'),
    );
  });

  it('weekly : 70 000 F / semaine sur 10 nuits → 100 000 F, jamais 700 000 F', () => {
    ouvrir(bien('weekly', 70_000), 10);

    const devis = screen.getByTestId('reservation-quote');
    expect(compact(within(devis).getByText('Total estimé').parentElement?.textContent)).toBe(
      compact('Total estimé 100 000 F CFA'),
    );
    expect(compact(devis.textContent)).not.toContain('700000');
  });

  it.each([
    ['monthly', 250_000, 'mois', '2500000'],
    ['yearly', 3_000_000, 'an', '30000000'],
  ] as const)(
    '%s : candidature au montant d’UN loyer, jamais prix × nuits (AC2 amendé)',
    (period, price, unite, prixFoisNuits) => {
      ouvrir(bien(period, price), 10);

      // En premier : c'est le défaut du ticket, et c'est lui que le rouge doit nommer.
      expect(compact(document.body.textContent)).not.toContain(prixFoisNuits);
      expect(screen.getByRole('heading', { name: 'Postuler à ce bien' })).toBeInTheDocument();
      const loyer = screen.getByTestId('reservation-rent');
      expect(compact(loyer.textContent)).toContain(compact(`${price.toLocaleString('fr-FR')} F CFA / ${unite}`));
      expect(screen.queryByTestId('reservation-quote')).not.toBeInTheDocument();
      // La candidature part : le parcours « Postuler » (TCK-165) reste vivant.
      submit.mockResolvedValue(undefined);
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer ma candidature' }));
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ start_date: '2026-10-01', end_date: '2026-10-11' }));
    },
  );
});
