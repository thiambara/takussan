/**
 * TCK-596 §5 — l'état des lieux pièce par pièce, depuis un téléphone.
 *
 * - AC13 : deux pièces montées. Un fichier choisi par la zone de la SECONDE pièce active le bouton
 *   d'envoi de la seconde, pas celui de la première. Sur le code d'origine, chaque zone portait
 *   l'id fixe `media-dropzone-input` : le `<label for>` de la pièce 2 désignait l'input de la
 *   pièce 1 (le premier de l'arbre). Le choix passe par le LABEL — le tap réel, l'input étant
 *   `sr-only` —, jamais par le glisser-déposer.
 * - AC14 : une photo JPEG de 7 Mo est acceptée et part à ≤ 5 Mo ; un fichier non image est refusé.
 * - AC16 : chaque pièce montre ses vignettes, supprimables en brouillon seulement.
 * - Le canevas de signature s'ouvre à qui l'API laisse signer (`can_sign_as`), et à lui seul.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { Inventory } from '@/types/inventory';

const { etat, upload, remove } = vi.hoisted(() => ({
  etat: { inventory: null as Inventory | null },
  upload: { mutateAsync: vi.fn(), isPending: false, isError: false },
  remove: { mutateAsync: vi.fn(), isPending: false, isError: false },
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
  useDeleteInventoryRoomPhoto: () => remove,
  useSignInventory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { InventoryDetail } from '../InventoryDetail';

const MO = 1024 * 1024;

function etatDesLieux(overrides: Partial<Inventory> = {}): Inventory {
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
    rooms: [
      { name: 'Salon', condition: 'good' },
      { name: 'Cuisine', condition: 'fair' },
    ],
    notes: null,
    tenant_signed: false,
    tenant_signed_at: null,
    owner_signed: false,
    owner_signed_at: null,
    created_at: '2026-10-01T09:00:00Z',
    room_photos: [
      { room_name: 'Salon', photos: [] },
      { room_name: 'Cuisine', photos: [] },
    ],
    can_sign_as: [],
    sign_on_behalf_of: null,
    ...overrides,
  };
}

function piece(nom: string): HTMLElement {
  return screen.getByTestId(`room-card-${nom}`);
}

function zoneDe(nom: string): HTMLLabelElement {
  const label = piece(nom).querySelector('label');
  if (!label) throw new Error(`aucune zone dans la pièce ${nom}`);
  return label;
}

function boutonEnvoi(nom: string): HTMLButtonElement {
  return within(piece(nom)).getByRole('button', { name: 'Envoyer les photos' });
}

/**
 * jsdom ne décode ni n'encode aucune image. Doublures du navigateur : un bitmap de 2 400 × 1 800
 * (SOUS le plafond de 2 560 px, donc que `reduirePhoto` seul laisserait passer intact) et un
 * encodeur dont le poids suit le nombre de pixels, comme un JPEG.
 */
function doublerLeNavigateur(octetsOriginaux: number) {
  const LARGEUR = 2400;
  const HAUTEUR = 1800;
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: LARGEUR, height: HAUTEUR, close: () => undefined })),
  );
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        private readonly w: number,
        private readonly h: number,
      ) {}
      getContext() {
        return { drawImage: () => undefined, imageSmoothingQuality: 'high' };
      }
      async convertToBlob({ type }: { type: string }) {
        const octets = Math.round((octetsOriginaux * (this.w * this.h)) / (LARGEUR * HAUTEUR));
        return new Blob([new Uint8Array(octets)], { type });
      }
    },
  );
}

describe('InventoryDetail — pièces (TCK-596 §5)', () => {
  beforeEach(() => {
    etat.inventory = etatDesLieux();
    upload.mutateAsync.mockReset();
    upload.mutateAsync.mockResolvedValue({});
    remove.mutateAsync.mockReset();
    remove.mutateAsync.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('AC13 — chaque zone désigne SON input : htmlFor distincts, chacun dans sa propre pièce', () => {
    render(withIntl(<InventoryDetail id={7} />));

    const salon = zoneDe('Salon');
    const cuisine = zoneDe('Cuisine');
    expect(salon.htmlFor).not.toBe(cuisine.htmlFor);
    expect(salon.control).not.toBeNull();
    expect(cuisine.control).not.toBeNull();
    expect(piece('Salon').contains(salon.control)).toBe(true);
    expect(piece('Cuisine').contains(cuisine.control)).toBe(true);
  });

  it('AC13 — un fichier choisi par la zone de la seconde pièce active SON envoi, pas celui de la première', async () => {
    const user = userEvent.setup();
    render(withIntl(<InventoryDetail id={7} />));

    expect(boutonEnvoi('Salon')).toBeDisabled();
    expect(boutonEnvoi('Cuisine')).toBeDisabled();

    // Le tap sur la zone : le fichier va au contrôle que le label désigne.
    await user.upload(zoneDe('Cuisine'), new File(['x'], 'cuisine.jpg', { type: 'image/jpeg' }));

    await waitFor(() => expect(boutonEnvoi('Cuisine')).toBeEnabled());
    expect(boutonEnvoi('Salon')).toBeDisabled();

    await user.click(boutonEnvoi('Cuisine'));
    expect(upload.mutateAsync).toHaveBeenCalledTimes(1);
    expect(upload.mutateAsync.mock.calls[0][0].roomName).toBe('Cuisine');
  });

  it('AC14 — une photo JPEG de 7 Mo est acceptée et part à 5 Mo au plus', async () => {
    doublerLeNavigateur(7 * MO);
    const user = userEvent.setup();
    render(withIntl(<InventoryDetail id={7} />));

    const lourde = new File([new Uint8Array(7 * MO)], 'telephone.jpg', { type: 'image/jpeg' });
    await user.upload(zoneDe('Salon'), lourde);

    await waitFor(() => expect(boutonEnvoi('Salon')).toBeEnabled());
    expect(within(piece('Salon')).queryByRole('alert')).not.toBeInTheDocument();
    // La limite affichée est celle de l'API.
    expect(within(piece('Salon')).getByText(/5\.00 Mo max/)).toBeInTheDocument();

    await user.click(boutonEnvoi('Salon'));
    const envoyes = upload.mutateAsync.mock.calls[0][0].files as File[];
    expect(envoyes).toHaveLength(1);
    expect(envoyes[0].type).toBe('image/jpeg');
    expect(envoyes[0].size).toBeLessThanOrEqual(5 * MO);
  });

  it('AC14 — un fichier non image est refusé avec le message de type', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(withIntl(<InventoryDetail id={7} />));

    await user.upload(zoneDe('Salon'), new File(['%PDF'], 'bail.pdf', { type: 'application/pdf' }));

    expect(await within(piece('Salon')).findByRole('alert')).toHaveTextContent(/Type non supporté/);
    expect(boutonEnvoi('Salon')).toBeDisabled();
  });

  it('AC16 — chaque pièce montre ses vignettes, et une suppression part pour la bonne photo', async () => {
    etat.inventory = etatDesLieux({
      room_photos: [
        { room_name: 'Salon', photos: [{ id: 11, url: 'https://api.test/m/11?signature=a', room_name: 'Salon' }] },
        {
          room_name: 'Cuisine',
          photos: [
            { id: 21, url: 'https://api.test/m/21?signature=b', room_name: 'Cuisine' },
            { id: 22, url: 'https://api.test/m/22?signature=c', room_name: 'Cuisine' },
          ],
        },
      ],
    });
    const user = userEvent.setup();
    render(withIntl(<InventoryDetail id={7} />));

    expect(within(piece('Salon')).getAllByRole('img')).toHaveLength(1);
    expect(within(piece('Cuisine')).getAllByRole('img')).toHaveLength(2);

    await user.click(within(piece('Cuisine')).getByRole('button', { name: 'Supprimer la photo 2 de la pièce Cuisine' }));
    expect(remove.mutateAsync).toHaveBeenCalledWith(22);
  });

  it('AC16 — un état soumis montre les vignettes sans zone ni suppression', () => {
    etat.inventory = etatDesLieux({
      status: 'pending_signature',
      room_photos: [
        { room_name: 'Salon', photos: [{ id: 11, url: 'https://api.test/m/11?signature=a', room_name: 'Salon' }] },
        { room_name: 'Cuisine', photos: [] },
      ],
    });
    render(withIntl(<InventoryDetail id={7} />));

    expect(within(piece('Salon')).getAllByRole('img')).toHaveLength(1);
    expect(within(piece('Salon')).queryByRole('button', { name: /Supprimer la photo/ })).not.toBeInTheDocument();
    expect(piece('Salon').querySelector('label')).toBeNull();
  });

  it('le canevas bailleur ne s’ouvre qu’à qui l’API laisse signer, et dit « pour le compte de »', () => {
    etat.inventory = etatDesLieux({
      status: 'pending_signature',
      can_sign_as: ['landlord'],
      sign_on_behalf_of: { id: 9, full_name: 'Awa Diop' },
    });
    const { unmount } = render(withIntl(<InventoryDetail id={7} />));

    expect(screen.getByTestId('signature-card-landlord')).toHaveTextContent('À signer');
    expect(screen.getByTestId('signature-card-tenant')).not.toHaveTextContent('À signer');
    expect(screen.getByTestId('signature-on-behalf-of')).toHaveTextContent('Pour le compte de Awa Diop');
    unmount();

    // Personne à qui l'API ne laisse rien signer (le super-admin compris) : aucun canevas.
    etat.inventory = etatDesLieux({ status: 'pending_signature', can_sign_as: [] });
    render(withIntl(<InventoryDetail id={7} />));
    expect(screen.getByTestId('signature-card-landlord')).not.toHaveTextContent('À signer');
    expect(screen.getByTestId('signature-card-tenant')).not.toHaveTextContent('À signer');
  });
});
