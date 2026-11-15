/**
 * TCK-2874 (ADR-0110 § 6) — ouverte par le lien « Inviter à candidater » (`?action=reserver&via=invitation`),
 * la boîte transmet l'indice à l'API (`via` du corps) — qui écrit `source = invitation` — et le garde
 * à travers la connexion. Sans l'indice, rien n'est envoyé.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { submitPurchaseOffer } from '@/app/actions/property';
import { PropertyReservationDialog } from '../PropertyReservationDialog';

vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: ({ value, onValueChange, placeholder }: {
    value?: string;
    onValueChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <input aria-label={placeholder} value={value ?? ''} onChange={(e) => onValueChange(e.target.value)} />
  ),
}));
let utilisateur: { id: number } | null = { id: 5 };
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: utilisateur, token: null, isLoading: false }),
}));
const soumettre = vi.fn(async (_donnees: unknown) => undefined);
vi.mock('@/hooks/useBookingRequest', () => ({
  useBookingRequest: () => ({ submit: soumettre, submitting: false, error: null }),
}));
vi.mock('@/app/actions/property', () => ({ submitPurchaseOffer: vi.fn(async () => ({ ok: true })) }));

const vente = {
  id: 7,
  slug: 'villa-ngor',
  title: 'Villa Ngor',
  price: 50_000_000,
  currency: 'XOF',
  contract_type: 'sale',
  owner: { id: 3, name: 'Awa', slug: 'awa', avatar_url: null, is_agent: true, member_since: null },
} as unknown as PropertyDetail;

function offrir(): void {
  render(withIntl(<PropertyReservationDialog property={vente} open onOpenChange={() => {}} />));
  fireEvent.change(screen.getByPlaceholderText('50000000'), { target: { value: '45000000' } });
  fireEvent.submit(screen.getByPlaceholderText('50000000').closest('form') as HTMLFormElement);
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
  utilisateur = { id: 5 };
  vi.mocked(submitPurchaseOffer).mockClear();
  soumettre.mockClear();
});

describe('l’indice du lien d’invitation', () => {
  it('une offre ouverte par le lien d’invitation envoie `via: invitation`', async () => {
    window.history.replaceState(null, '', '/fr/properties/villa-ngor?via=invitation');
    offrir();

    await waitFor(() => expect(submitPurchaseOffer).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitPurchaseOffer).mock.calls[0]?.[1]).toMatchObject({ via: 'invitation' });
  });

  it('sans l’indice, rien n’est envoyé', async () => {
    window.history.replaceState(null, '', '/fr/properties/villa-ngor');
    offrir();

    await waitFor(() => expect(submitPurchaseOffer).toHaveBeenCalledTimes(1));
    expect(vi.mocked(submitPurchaseOffer).mock.calls[0]?.[1]?.via).toBeUndefined();
  });

  it('une candidature au mois ouverte par le lien d’invitation envoie `via: invitation`', async () => {
    window.history.replaceState(null, '', '/fr/properties/villa-ngor?via=invitation');
    const { container } = render(
      withIntl(
        <PropertyReservationDialog
          property={{ ...vente, contract_type: 'rent', rent_period: 'monthly', price: 300_000 } as PropertyDetail}
          open
          onOpenChange={() => {}}
        />,
      ),
    );
    fireEvent.submit(document.querySelector('form') ?? (container.querySelector('form') as HTMLFormElement));

    await waitFor(() => expect(soumettre).toHaveBeenCalledTimes(1));
    expect(soumettre.mock.calls[0]?.[0]).toMatchObject({ via: 'invitation' });
  });

  it('sans compte, la connexion ramène à la boîte AVEC l’indice (candidature au mois)', () => {
    utilisateur = null;
    window.history.replaceState(null, '', '/fr/properties/villa-ngor?action=reserver&via=invitation');
    render(
      withIntl(
        <PropertyReservationDialog
          property={{ ...vente, contract_type: 'rent', rent_period: 'monthly', price: 300_000 } as PropertyDetail}
          open
          onOpenChange={() => {}}
        />,
      ),
    );

    const href = screen.getByRole('link', { name: 'Se connecter' }).getAttribute('href') ?? '';
    expect(decodeURIComponent(href)).toContain('/properties/villa-ngor?action=reserver&via=invitation');
  });
});
