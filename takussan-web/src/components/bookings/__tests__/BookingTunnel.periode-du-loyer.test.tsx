import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { useAuth } from '@/context/AuthContext';
import type { PropertyDetail } from '@/types/property';
import { BookingTunnel } from '../BookingTunnel';

/**
 * TCK-530 — le total du tunnel dépend de `rent_period`. Un test par période.
 *
 * Les dates sont injectées par `useWatch` : piloter le sélecteur de dates n'éprouverait rien du
 * calcul, et c'est le calcul qui était faux.
 */
const dates = vi.hoisted(() => ({ start_date: '', end_date: '', guests: 1 }));

vi.mock('react-hook-form', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-hook-form')>()),
  useWatch: () => dates,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/lib/queries/bookings', () => ({
  useCreateBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function bien(rent_period: PropertyDetail['rent_period'], price: number): PropertyDetail {
  return {
    id: 7,
    slug: 'bien-7',
    title: 'Appartement Almadies',
    price,
    currency: 'XOF',
    contract_type: 'rent',
    rent_period,
    rent_period_label: null,
    main_photo_url: null,
    location: { city: 'Dakar' },
    owner: { id: 3, name: 'Awa', slug: 'awa-agent', avatar_url: null, is_agent: true, member_since: null },
  } as unknown as PropertyDetail;
}

/** « 60 000 F CFA » → « 60000FCFA » : les espaces insécables d'Intl ne font pas le test. */
const compact = (text: string | null | undefined) => (text ?? '').replace(/\s/g, '');

function renderTunnel(property: PropertyDetail) {
  render(withIntl(<BookingTunnel property={property} />));
}

function totalAffiche(): string {
  const ligne = screen.getByText('Total estimé').parentElement;
  return compact(ligne?.textContent);
}

describe('BookingTunnel — total selon la période du loyer (TCK-530)', () => {
  beforeEach(() => {
    // 10 nuits.
    dates.start_date = '2026-10-01';
    dates.end_date = '2026-10-11';
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 1 },
      isLoading: false,
    } as unknown as ReturnType<typeof useAuth>);
  });

  it('daily : 20 000 F × 3 nuits → 60 000 F, acompte 18 000 F (AC1)', () => {
    dates.end_date = '2026-10-04';
    renderTunnel(bien('daily', 20_000));

    expect(totalAffiche()).toBe(compact('Total estimé 60 000 F CFA'));
    expect(compact(screen.getByText('Acompte attendu').parentElement?.textContent)).toBe(
      compact('Acompte attendu 18 000 F CFA'),
    );
  });

  it('weekly : 70 000 F / semaine sur 10 nuits → 100 000 F', () => {
    renderTunnel(bien('weekly', 70_000));

    expect(totalAffiche()).toBe(compact('Total estimé 100 000 F CFA'));
  });

  it('monthly : jamais prix × nuits — état vide, sans montant (AC2)', () => {
    renderTunnel(bien('monthly', 250_000));

    const etat = screen.getByTestId('booking-long-term');
    expect(within(etat).getByText("Ce bien se loue au mois ou à l'année")).toBeInTheDocument();
    // Le calcul d'avant rendait 250 000 × 10 = 2 500 000 F.
    expect(compact(document.body.textContent)).not.toContain('2500000');
    expect(screen.queryByText('Total estimé')).not.toBeInTheDocument();
    // Base UI pose `role="button"` sur le lien : on remonte à l'ancre.
    expect(within(etat).getByText("Contacter l'agent").closest('a')).toHaveAttribute(
      'href',
      '/agents/awa-agent',
    );
    expect(within(etat).getByText('Retour au bien').closest('a')).toHaveAttribute(
      'href',
      '/properties/bien-7',
    );
  });

  it('yearly : même refus, sans montant ; sans profil d’agent, le contact mène à la fiche', () => {
    renderTunnel({ ...bien('yearly', 3_000_000), owner: null } as unknown as PropertyDetail);

    expect(screen.getByTestId('booking-long-term')).toBeInTheDocument();
    expect(compact(document.body.textContent)).not.toContain('30000000');
    expect(screen.queryByText('Total estimé')).not.toBeInTheDocument();
    expect(screen.getByText("Contacter l'agent").closest('a')).toHaveAttribute('href', '/properties/bien-7');
    expect(screen.queryByText('Retour au bien')).not.toBeInTheDocument();
  });

  it('monthly : le refus précède l’invitation à se connecter', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isLoading: false } as unknown as ReturnType<typeof useAuth>);
    renderTunnel(bien('monthly', 250_000));

    expect(screen.getByTestId('booking-long-term')).toBeInTheDocument();
    expect(screen.queryByText('Connectez-vous pour réserver')).not.toBeInTheDocument();
  });
});
