/**
 * TCK-913 (P08.10) — saisie au téléphone sur le bail et ses garants.
 *
 * - Le téléphone du garant s'affichait en texte nu (aucun lien `tel:`), et se saisissait dans un
 *   `FormInput` sans `type` : clavier alphabétique, indicatif à taper. Il passe par `PhoneInput`.
 * - Les montants du bail étaient des `type="number"` sans `inputMode` ; ils passent par
 *   `FormAmountInput` (clavier numérique, montant groupé à la relecture), et le jour de paiement
 *   prend `inputMode="numeric"`.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { LeaseGuarantor } from '@/lib/queries/leases';

const { GARANTS, BIENS, CLIENTS, AUTH, ROUTEUR, MUTATION } = vi.hoisted(() => ({
  GARANTS: {
    data: {
      data: [
        { id: 1, first_name: 'Awa', last_name: 'Diop', phone: '+221770000001', email: null, role: null },
      ] as LeaseGuarantor[],
    },
    isLoading: false,
    isError: false,
  },
  BIENS: { data: [] },
  CLIENTS: { data: [] },
  AUTH: { user: { id: 4, full_name: 'Moussa Fall' } },
  ROUTEUR: { push: () => {}, back: () => {} },
  MUTATION: { mutateAsync: async () => ({ data: { id: 1 } }), isPending: false },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/lib/queries/leases', () => ({
  useLeaseGuarantors: () => GARANTS,
  useCreateGuarantor: () => MUTATION,
  useCreateLease: () => MUTATION,
  useLeasePropertyOptions: () => ({ data: BIENS, isLoading: false }),
  useLeaseCustomerOptions: () => ({ data: CLIENTS, isLoading: false }),
}));

import { GuarantorSection } from '../GuarantorSection';
import { CreateLeaseForm } from '../CreateLeaseForm';

describe('GuarantorSection — téléphone du garant (TCK-913)', () => {
  it('affiche le téléphone en lien tel:', () => {
    render(withIntl(<GuarantorSection leaseId={42} canManage />));
    const lien = screen.getByRole('link', { name: '+221770000001' });
    expect(lien).toHaveAttribute('href', 'tel:+221770000001');
  });

  it('saisit le téléphone dans un champ tel, indicatif en préfixe', async () => {
    const user = userEvent.setup();
    render(withIntl(<GuarantorSection leaseId={42} canManage />));
    await user.click(screen.getByRole('button', { name: 'Ajouter un garant' }));

    const champ = await screen.findByLabelText(/Téléphone/);
    expect(champ).toHaveAttribute('type', 'tel');
    expect(champ).toHaveAttribute('autocomplete', 'tel');
    expect(screen.getByText('+221')).toBeInTheDocument();
  });
});

describe('CreateLeaseForm — claviers numériques (TCK-913)', () => {
  it('loyer et caution au clavier numérique, groupés à la relecture', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm />));

    for (const libelle of [/Loyer mensuel/, /Caution/]) {
      const champ = screen.getByLabelText(libelle);
      expect(champ).toHaveAttribute('inputmode', 'numeric');
      expect(champ).not.toHaveAttribute('type', 'number');
    }
    await user.type(screen.getByLabelText(/Loyer mensuel/), '250000');
    // Espace fine insécable en français : `\s` la couvre.
    expect((screen.getByLabelText(/Loyer mensuel/) as HTMLInputElement).value).toMatch(/^250\s000$/);
  });

  it('jour de paiement au clavier numérique', () => {
    render(withIntl(<CreateLeaseForm />));
    expect(screen.getByLabelText(/Jour du paiement/)).toHaveAttribute('inputmode', 'numeric');
  });
});
