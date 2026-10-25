/**
 * P237.04 (TCK-2371) — la dépublication en lot part en une requête par bien (`Promise.all`). Au
 * premier refus, les biens déjà dépubliés le sont pour de bon, mais la liste n'était relue que sur
 * un succès complet : ils paraissaient inchangés. Décision du porteur : la liste du lot se relit
 * dans `onSettled`, et l'erreur reste dite.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { postPropertyAction } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import type { AdminPropertyRow } from '@/types/super-admin';
import { SuperAdminPropertiesTable } from '../SuperAdminPropertiesTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/queries/super-admin', () => ({
  archiveProperties: vi.fn(),
  deleteProperty: vi.fn(),
  postPropertyAction: vi.fn(),
}));

function bien(id: number, title: string): AdminPropertyRow {
  return {
    id,
    reference_number: `TK-${id}`,
    title,
    slug: `bien-${id}`,
    type: 'apartment',
    status: 'available',
    status_label: null,
    visibility: 'public',
    contract_type: 'rent',
    rent_period: 'monthly',
    price: 250000,
    currency: 'XOF',
    published_at: '2026-10-01T10:00:00+00:00',
    created_at: '2026-09-30T10:00:00+00:00',
    location: { city: 'Dakar', region: 'Dakar', country: 'SN' },
    agency: null,
  };
}

function monter(onChange: () => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <SuperAdminPropertiesTable rows={[bien(47, 'Studio à Ouakam'), bien(48, 'Villa à Ngor')]} total={2} onChange={onChange} />
    </QueryClientProvider>,
  ));
}

async function depublierLeLot() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('checkbox', { name: 'Tout sélectionner' }));
  await user.click(screen.getByRole('button', { name: 'Dépublier' }));
  await user.type(await screen.findByTestId('confirm-action-input'), 'DEPUBLIER');
  await user.click(screen.getByRole('button', { name: 'Confirmer la dépublication' }));
}

describe('SuperAdminPropertiesTable — dépublication en lot refusée en partie (P237.04)', () => {
  it('un bien refusé après un bien dépublié : la liste se relit, et le refus reste dit', async () => {
    vi.mocked(postPropertyAction).mockImplementation(async (id: number) => {
      if (id === 48) throw new ApiError(422, { message: 'Ce bien ne peut pas être dépublié.' });
      return {} as never;
    });
    const onChange = vi.fn();
    monter(onChange);

    await depublierLeLot();

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText('Ce bien ne peut pas être dépublié.').length).toBeGreaterThan(0);
  });

  it('un lot entièrement accepté se relit une seule fois', async () => {
    vi.mocked(postPropertyAction).mockResolvedValue({} as never);
    const onChange = vi.fn();
    monter(onChange);

    await depublierLeLot();

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
