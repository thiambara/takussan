import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import frMessages from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

/**
 * TCK-1370 (P114.03) — le motif de rejet d'un devis exige 10 caractères des deux côtés (TCK-095,
 * `RejectQuoteRequest` : `min:10`). Le formulaire en acceptait 5 : un motif de 5 à 9 caractères
 * passait, puis l'API répondait 422.
 */
const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queries/maintenance', () => ({
  useRejectMaintenanceQuote: () => ({ mutateAsync }),
}));

import { QuoteRejectionModal } from '../QuoteRejectionModal';

const REJET = frMessages.maintenance.quote.reject;

async function saisirEtConfirmer(motif: string) {
  const user = userEvent.setup();
  render(withIntl(<QuoteRejectionModal id={4} open onClose={vi.fn()} />));
  await user.type(await screen.findByLabelText(REJET.reason_label), motif);
  await user.click(screen.getByRole('button', { name: REJET.confirm }));
}

describe('<QuoteRejectionModal> — borne du motif', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({});
  });

  it('9 caractères : refusé par le formulaire, avec le message qui dit 10', async () => {
    await saisirEtConfirmer('123456789');

    expect(await screen.findByText(REJET.reason_min_length)).toBeInTheDocument();
    expect(REJET.reason_min_length).toContain('10');
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('10 caractères : envoyé', async () => {
    await saisirEtConfirmer('1234567890');

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ reason: '1234567890' }));
  });
});
