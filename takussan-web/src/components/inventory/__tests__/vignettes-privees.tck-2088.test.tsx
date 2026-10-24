/**
 * TCK-2088 (P180.02, ADR-0029, amendement du 2026-10-23) — les vignettes privées ne chargent plus
 * l'original.
 *
 * La grille de l'état des lieux et la galerie de maintenance posaient l'URL signée de l'ORIGINAL
 * (jusqu'à 5 et 10 Mo) dans une tuile d'une centaine de pixels. L'API rend désormais, à côté de
 * `url`, l'URL signée d'une conversion (`preview_url`, `thumbnail_url`) : la tuile l'affiche, et
 * le clic ouvre l'original.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { Inventory } from '@/types/inventory';
import type { MaintenanceRequest } from '@/types/maintenance';

const { etat } = vi.hoisted(() => ({ etat: { inventory: null as Inventory | null } }));

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
  useUploadInventoryRoomPhotos: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useDeleteInventoryRoomPhoto: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useSignInventory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/queries/maintenance', () => ({
  useUploadMaintenancePhotos: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
}));

import { InventoryDetail } from '../InventoryDetail';
import { MaintenanceGallery } from '../../maintenance/MaintenanceGallery';

const ORIGINAL = 'https://api.test/api/media/11/file?expires=1&signature=a';
const VIGNETTE = 'https://api.test/api/media/11/file?conversion=preview&expires=1&signature=b';

describe('TCK-2088 — état des lieux', () => {
  it('la tuile affiche la preview, et le clic ouvre l’original', () => {
    etat.inventory = {
      id: 7,
      lease_id: 3,
      property_id: 2,
      type: 'move_in',
      conducted_by: 1,
      tenant_id: 4,
      conducted_at: '2026-10-01T09:00:00Z',
      status: 'signed',
      general_condition: 'good',
      rooms: [{ name: 'Salon', condition: 'good' }],
      notes: null,
      tenant_signed: true,
      tenant_signed_at: '2026-10-01T10:00:00Z',
      owner_signed: true,
      owner_signed_at: '2026-10-01T10:00:00Z',
      created_at: '2026-10-01T09:00:00Z',
      room_photos: [
        { room_name: 'Salon', photos: [{ id: 11, url: ORIGINAL, preview_url: VIGNETTE, room_name: 'Salon' }] },
      ],
      can_sign_as: [],
      sign_on_behalf_of: null,
      abilities: { update: false },
    };

    render(withIntl(<InventoryDetail id={7} />));

    const piece = screen.getByTestId('room-card-Salon');
    const image = within(piece).getByRole('img');
    expect(image).toHaveAttribute('src', VIGNETTE);
    expect(image.closest('a')).toHaveAttribute('href', ORIGINAL);
  });
});

describe('TCK-2088 — maintenance', () => {
  it('la tuile affiche la vignette, et le clic ouvre l’original', () => {
    const vignette = 'https://api.test/api/media/12/file?conversion=thumbnail&expires=1&signature=c';
    const original = 'https://api.test/api/media/12/file?expires=1&signature=d';
    const request = {
      id: 5,
      abilities: { can_upload_before_photos: false },
      media: {
        photos: [
          {
            id: 12,
            name: 'fuite.jpg',
            mime_type: 'image/jpeg',
            size: 3_000_000,
            url: original,
            thumbnail_url: vignette,
            created_at: null,
          },
        ],
        before_photos: [],
        completion_photos: [],
      },
    } as unknown as MaintenanceRequest;

    render(withIntl(<MaintenanceGallery request={request} />));

    const image = screen.getByRole('img', { name: 'fuite.jpg' });
    expect(image).toHaveAttribute('src', vignette);
    expect(image.closest('a')).toHaveAttribute('href', original);
  });
});
