/**
 * P244.01 (TCK-2361) — le motif d'une étape terminale (« perdu », « converti ») se saisit dans
 * `ReasonDialog`. La fiche lançait la mutation puis fermait le dialogue dans le même geste : sur un
 * refus (422 d'un motif de plus de 5 000 caractères, 403, réseau), le texte saisi n'existait plus
 * nulle part. Patron de TCK-2212 : le dialogue se ferme sur le succès, garde le motif sur un refus
 * et y dit l'erreur, et le champ porte la borne de l'API (`max:5000`).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import { CustomerStageControl } from '../CustomerStageControl';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
const patchCustomerPipelineStage = vi.fn();
vi.mock('@/lib/queries/pipeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/pipeline')>()),
  patchCustomerPipelineStage: (...a: unknown[]) => patchCustomerPipelineStage(...a),
}));

function rendu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <CustomerStageControl customerId={9} name="Awa Diop" stage="prospect" />
    </QueryClientProvider>,
  ));
}

async function saisirLeMotif(motif: string) {
  await userEvent.selectOptions(screen.getByLabelText('Étape de Awa Diop'), 'lost');
  await userEvent.type(await screen.findByTestId('reason-input'), motif);
  await userEvent.click(screen.getByTestId('reason-submit'));
}

describe('CustomerStageControl — motif refusé (P244.01)', () => {
  beforeEach(() => {
    patchCustomerPipelineStage.mockReset();
    refresh.mockReset();
  });

  it('le champ du motif porte la borne de l’API', async () => {
    rendu();
    await userEvent.selectOptions(screen.getByLabelText('Étape de Awa Diop'), 'lost');
    expect(await screen.findByTestId('reason-input')).toHaveAttribute('maxlength', '5000');
  });

  it('refus en 422 : le dialogue reste ouvert, le motif y est, l’erreur s’y lit', async () => {
    patchCustomerPipelineStage.mockRejectedValue(
      new ApiError(422, { message: 'Le motif est trop long.', errors: { reason: ['Le motif est trop long.'] } }),
    );
    rendu();

    await saisirLeMotif('Budget insuffisant');

    await waitFor(() => expect(patchCustomerPipelineStage).toHaveBeenCalledWith('jeton', 9, 'lost', 'Budget insuffisant'));
    const dialogue = await screen.findByRole('dialog');
    expect(await within(dialogue).findByRole('alert')).toHaveTextContent('Le motif est trop long.');
    expect(within(dialogue).getByTestId('reason-input')).toHaveValue('Budget insuffisant');
  });

  it('succès : le dialogue se ferme, la fiche se relit', async () => {
    patchCustomerPipelineStage.mockResolvedValue({});
    rendu();

    await saisirLeMotif('Budget insuffisant');

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('reason-input')).not.toBeInTheDocument());
  });
});
