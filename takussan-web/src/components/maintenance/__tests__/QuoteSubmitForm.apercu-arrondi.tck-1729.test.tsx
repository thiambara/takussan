import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { MaintenanceRequest } from '@/types/maintenance';
import { QuoteSubmitForm } from '../QuoteSubmitForm';

vi.mock('@/lib/queries/maintenance', () => ({
  useSubmitMaintenanceQuote: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
}));

/**
 * TCK-1729 (P133.06, point 2) — l'aperçu du total arrondit chaque ligne puis le total à l'unité de
 * la devise, comme `MaintenanceQuoteWorkflow::priceLines`, et se formate dans la devise de la
 * demande. Avant : somme des produits bruts (3 × 1,5 × 333 = 1 498,5, affiché 1 499 quand le devis
 * enregistré vaut 1 500), formatée en XOF quelle que soit la devise.
 */
function saisir(lignes: { quantity: string; unit_price: string }[]) {
  for (let i = 1; i < lignes.length; i++) fireEvent.click(screen.getByRole('button', { name: 'Ajouter une ligne' }));
  const quantites = screen.getAllByLabelText('Quantité');
  const prix = screen.getAllByLabelText('Prix unitaire');
  lignes.forEach((l, i) => {
    fireEvent.change(quantites[i], { target: { value: l.quantity } });
    fireEvent.change(prix[i], { target: { value: l.unit_price } });
  });
}

function apercu(): string {
  return screen.getByText(/^Total estimé/).textContent?.replace(/\s/g, ' ') ?? '';
}

describe('<QuoteSubmitForm> — aperçu du total (TCK-1729)', () => {
  it('XOF : trois lignes de 1,5 × 333 donnent 1 500, comme l’API, et pas 1 499', () => {
    render(withIntl(<QuoteSubmitForm request={{ id: 7, status: 'quote_requested', quote_currency: null } as MaintenanceRequest} />));
    saisir([{ quantity: '1.5', unit_price: '333' }, { quantity: '1.5', unit_price: '333' }, { quantity: '1.5', unit_price: '333' }]);

    expect(apercu()).toMatch(/1 500/);
    expect(apercu()).not.toMatch(/1 499/);
  });

  it('dans la devise de la demande : EUR, ligne arrondie au centime', () => {
    render(withIntl(<QuoteSubmitForm request={{ id: 7, status: 'rejected', quote_currency: 'EUR' } as MaintenanceRequest} />));
    saisir([{ quantity: '1.5', unit_price: '333.33' }]);

    // 1,5 × 333,33 = 499,995 → 500,00 € (arrondi au demi supérieur, `CurrencyUnit::round`).
    expect(apercu()).toMatch(/500,00/);
    expect(apercu()).toContain('€');
  });
});
