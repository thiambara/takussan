/**
 * P228.05 (TCK-2218) — l'envoi d'un état des lieux à la signature, refusé par l'API (écran périmé :
 * il n'est plus un brouillon, 422 `inventory.not_draft_submit`), se dit sous les gestes par
 * `useMessageErreurApi()` (ADR-0019). Avant, `submit.mutate()` n'avait aucun chemin d'erreur.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import type { Inventory } from '@/types/inventory';

const MESSAGE_API = 'Cet état des lieux n’est plus un brouillon.';

const { etat, envoi } = vi.hoisted(() => ({
  etat: { inventory: null as Inventory | null },
  envoi: { mutate: vi.fn(), isPending: false },
}));

vi.mock('@/lib/queries/inventory', () => ({
  useInventory: () => ({
    data: { data: etat.inventory },
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => undefined,
  }),
  useSubmitInventory: () => envoi,
  useDisputeInventory: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useUploadInventoryRoomPhotos: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useDeleteInventoryRoomPhoto: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useSignInventory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { InventoryDetail } from '../InventoryDetail';

etat.inventory = {
  id: 7,
  lease_id: 3,
  property_id: 2,
  type: 'move_in',
  conducted_by: 1,
  tenant_id: 4,
  conducted_at: '2026-10-01T09:00:00Z',
  status: 'draft',
  general_condition: 'good',
  rooms: [],
  notes: null,
  tenant_signed: false,
  tenant_signed_at: null,
  owner_signed: false,
  owner_signed_at: null,
  created_at: '2026-10-01T09:00:00Z',
  room_photos: [],
  can_sign_as: [],
  sign_on_behalf_of: null,
  abilities: { update: true },
};

describe('InventoryDetail — l’envoi refusé se dit (P228.05)', () => {
  it('un refus de l’API affiche son message', async () => {
    envoi.mutate.mockImplementation(
      (_vars: unknown, options?: { onError?: (erreur: unknown) => void }) =>
        options?.onError?.(new ApiError(422, { message: MESSAGE_API })),
    );
    render(withIntl(<InventoryDetail id={7} />));

    await userEvent.click(screen.getByRole('button', { name: 'Soumettre pour signature' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE_API);
  });
});
