import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import { VisitFeedbackForm } from '../VisitFeedbackForm';

// ─── Mocks ───────────────────────────────────────────────────────────────────
const mutateAsync = vi.fn();

vi.mock('@/lib/queries/visits', () => ({
  useSubmitVisitFeedback: () => ({
    mutateAsync,
    isPending: false,
  }),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // TCK-292 : `messages={{}}` rendrait la CLÉ et non le libellé — `withIntl` charge le VRAI
  // `fr.json`, ce qui laisse les assertions françaises de ce fichier inchangées.
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('<VisitFeedbackForm>', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue({ data: {} });
  });

  it('renders a 5-star rating selector and a textarea', () => {
    render(wrap(<VisitFeedbackForm visitId={1} role="customer" />));

    expect(screen.getByText(/votre retour visiteur/i)).toBeInTheDocument();
    for (let n = 1; n <= 5; n++) {
      expect(screen.getByRole('button', { name: `${n} étoiles` })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /envoyer/i })).toBeInTheDocument();
  });

  it('submits the selected rating + comment with the role', async () => {
    const user = userEvent.setup();
    const onSubmitted = vi.fn();
    render(
      wrap(<VisitFeedbackForm visitId={42} role="customer" onSubmitted={onSubmitted} />),
    );

    await user.click(screen.getByRole('button', { name: /3 étoiles/i }));
    await user.type(screen.getByRole('textbox'), 'Tout nickel.');
    await user.click(screen.getByRole('button', { name: /envoyer/i }));

    expect(mutateAsync).toHaveBeenCalledWith({
      role: 'customer',
      rating: 3,
      comment: 'Tout nickel.',
    });
    expect(onSubmitted).toHaveBeenCalled();
    expect(await screen.findByText(/bien été enregistré/i)).toBeInTheDocument();
  });

  it('labels the form differently when role=agent', () => {
    render(wrap(<VisitFeedbackForm visitId={1} role="agent" />));
    expect(screen.getByText(/retour agent/i)).toBeInTheDocument();
  });

  it('shows the API error message when submission fails', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(new Error('Feedback window has closed for this visit.'));
    render(wrap(<VisitFeedbackForm visitId={1} role="customer" />));

    await user.click(screen.getByRole('button', { name: /envoyer/i }));

    expect(await screen.findByText(/feedback window has closed/i)).toBeInTheDocument();
  });
});
