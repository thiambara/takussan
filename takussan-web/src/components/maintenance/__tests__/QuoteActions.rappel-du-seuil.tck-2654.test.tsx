import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { MaintenanceRequest } from '@/types/maintenance';
import { QuoteActions } from '../QuoteActions';

/**
 * TCK-2654 (L3b, partie 2) — la notification `maintenance_quote.awaiting_owner` mène le bailleur à la fiche
 * (`/app/maintenance/{id}`) : il y lit son plafond, comme sur sa liste. Le rappel ne s'adresse qu'à qui
 * tranche (`can_decide_quote`) : l'agence, qui lit la même fiche, ne le voit pas (« votre mandat »).
 */
const RAPPEL = /^Au-dessus de .*150.000.*votre mandat prévoit votre accord\.$/;

function monter(surcharge: Record<string, unknown>) {
  const request = {
    id: 42,
    status: 'awaiting_owner',
    quote_amount: 485000,
    quote_currency: 'XOF',
    owner_approval_threshold: 150000,
    abilities: { can_request_quote: false, can_decide_quote: true, can_view_quote_pdf: true },
    ...surcharge,
  } as unknown as MaintenanceRequest;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{<QuoteActions request={request} />}</QueryClientProvider>));
}

describe('QuoteActions — le rappel du plafond (TCK-2654)', () => {
  it('le bailleur qui tranche un devis en `awaiting_owner` lit son plafond, avec ses gestes et le PDF', () => {
    monter({});
    expect(screen.getByText(RAPPEL)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approuver le devis' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Télécharger le devis (PDF)' })).toBeTruthy();
  });

  it('l’agence, sur la même fiche (`can_decide_quote` faux), ne lit pas « votre mandat »', () => {
    monter({ abilities: { can_request_quote: false, can_decide_quote: false, can_view_quote_pdf: true } });
    expect(screen.getByText('Ce devis dépasse le plafond de travaux du bailleur : il attend son accord.')).toBeTruthy();
    expect(document.querySelector('[data-slot="rappel-du-plafond"]')).toBeNull();
  });

  it('hors `awaiting_owner`, ou sans plafond servi : aucun rappel', () => {
    const { unmount } = monter({ status: 'quote_submitted' });
    expect(document.querySelector('[data-slot="rappel-du-plafond"]')).toBeNull();
    unmount();
    monter({ owner_approval_threshold: undefined });
    expect(document.querySelector('[data-slot="rappel-du-plafond"]')).toBeNull();
  });
});
