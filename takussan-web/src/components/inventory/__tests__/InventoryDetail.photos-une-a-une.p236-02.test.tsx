/**
 * TCK-2370 (P236.02) — les photos d'une pièce d'état des lieux partaient en un seul `FormData` :
 * jusqu'à 20 photos de 5 Mo au plus après réduction, au-delà de la borne du proxy (25 Mio). Elles
 * partent une à une, comme la clôture (TCK-2330) : le premier échec arrête tout et se dit, et une
 * photo jointe sort de la sélection, pour que réessayer n'envoie que le reste.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import type { Inventory } from '@/types/inventory';

const { etat, upload } = vi.hoisted(() => ({
  etat: { inventory: null as Inventory | null },
  upload: { mutateAsync: vi.fn(), isPending: false, isError: false, error: null },
}));

vi.mock('@/lib/queries/inventory', () => ({
  useInventory: () => ({
    data: { data: etat.inventory },
    isLoading: false,
    isError: false,
    error: null,
    refetch: () => undefined,
  }),
  useSubmitInventory: () => ({ mutate: vi.fn(), isPending: false }),
  useDisputeInventory: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useUploadInventoryRoomPhotos: () => upload,
  useDeleteInventoryRoomPhoto: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useSignInventory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// La réduction passe par un canvas, que jsdom n'a pas : les fichiers passent tels quels.
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhotos: async (files: File[]) => files,
  reduirePhotosSousPlafond: async (files: File[]) => files,
}));

import { InventoryDetail } from '../InventoryDetail';

const MO = 1024 * 1024;

function etatDesLieux(): Inventory {
  return {
    id: 7,
    lease_id: 3,
    property_id: 2,
    type: 'move_in',
    conducted_by: 1,
    tenant_id: 4,
    conducted_at: '2026-10-01T09:00:00Z',
    status: 'draft',
    general_condition: 'good',
    rooms: [{ name: 'Salon', condition: 'good' }],
    notes: null,
    tenant_signed: false,
    tenant_signed_at: null,
    owner_signed: false,
    owner_signed_at: null,
    created_at: '2026-10-01T09:00:00Z',
    room_photos: [{ room_name: 'Salon', photos: [] }],
    can_sign_as: [],
    sign_on_behalf_of: null,
    abilities: { update: true },
  };
}

function photos(n: number): File[] {
  return Array.from(
    { length: n },
    (_, i) => new File([new Uint8Array(Math.round(1.4 * MO))], `salon-${i + 1}.jpg`, { type: 'image/jpeg' }),
  );
}

function salon(): HTMLElement {
  return screen.getByTestId('room-card-Salon');
}

async function choisir(user: ReturnType<typeof userEvent.setup>, fichiers: File[]) {
  const zone = salon().querySelector('label');
  if (!zone) throw new Error('aucune zone dans la pièce');
  await user.upload(zone, fichiers);
}

function boutonEnvoi(): HTMLButtonElement {
  return within(salon()).getByRole('button', { name: 'Envoyer les photos' });
}

describe('InventoryDetail — photos d’une pièce une à une (P236.02)', () => {
  beforeEach(() => {
    etat.inventory = etatDesLieux();
    upload.mutateAsync.mockReset();
  });

  it('19 photos partent en 19 appels d’une photo chacun', async () => {
    upload.mutateAsync.mockResolvedValue({});
    const user = userEvent.setup();
    render(withIntl(<InventoryDetail id={7} />));
    const choisies = photos(19);
    await choisir(user, choisies);
    await waitFor(() => expect(boutonEnvoi()).toBeEnabled());

    await user.click(boutonEnvoi());

    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(19));
    expect(upload.mutateAsync.mock.calls.map(([v]) => v)).toEqual(
      choisies.map((photo) => ({ files: [photo], roomName: 'Salon' })),
    );
    await waitFor(() => expect(boutonEnvoi()).toBeDisabled());
  });

  it('le premier échec arrête l’envoi, se dit, et réessayer n’envoie que le reste', async () => {
    upload.mutateAsync
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new ApiError(413, { code: 'payload_too_large' }));
    const user = userEvent.setup();
    render(withIntl(<InventoryDetail id={7} />));
    const [premiere, ...reste] = photos(4);
    await choisir(user, [premiere, ...reste]);
    await waitFor(() => expect(boutonEnvoi()).toBeEnabled());

    await user.click(boutonEnvoi());

    expect(await within(salon()).findByRole('alert')).toHaveTextContent(
      "L'envoi dépasse 25 Mo : envoyez moins de fichiers à la fois, ou des fichiers plus légers.",
    );
    expect(upload.mutateAsync).toHaveBeenCalledTimes(2);

    upload.mutateAsync.mockReset();
    upload.mutateAsync.mockResolvedValue({});
    await user.click(boutonEnvoi());

    await waitFor(() => expect(upload.mutateAsync).toHaveBeenCalledTimes(3));
    expect(upload.mutateAsync.mock.calls.map(([v]) => v.files[0])).toEqual(reste);
  });
});
