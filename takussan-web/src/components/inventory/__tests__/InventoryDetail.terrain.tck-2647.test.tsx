/**
 * TCK-2647 — quand le brouillon s'ouvre dans le parcours de terrain.
 *
 * Il s'y ouvre quand une pièce est EXPLICITEMENT inachevée (`completed: false`, posé par « Démarrer »),
 * ou quand `?piece=` le demande (« Revoir les pièces »). Un brouillon antérieur au parcours (pièces
 * sans la clé) garde la page de relecture : sinon, un serveur qui ne garderait pas `completed`
 * rouvrirait la pièce 1 sans fin. Un état des lieux soumis, ou un brouillon que l'API ne laisse pas
 * modifier, ne s'y ouvre jamais.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { Inventory, InventoryRoom } from '@/types/inventory';

const { etat } = vi.hoisted(() => ({ etat: { inventory: null as Inventory | null, piece: null as string | null } }));

vi.mock('@/lib/queries/inventory', () => ({
  useInventory: () => ({ data: { data: etat.inventory }, isLoading: false, isError: false, error: null, refetch: () => undefined }),
  useSubmitInventory: () => ({ mutate: vi.fn(), isPending: false }),
  useDisputeInventory: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useUploadInventoryRoomPhotos: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useDeleteInventoryRoomPhoto: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useSignInventory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(etat.piece ? { piece: etat.piece } : {}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('../terrain/ParcoursDeTerrain', () => ({
  ParcoursDeTerrain: ({ pieceDemandee }: { pieceDemandee: number | null }) => <div data-testid="parcours">pièce {String(pieceDemandee)}</div>,
}));

import { InventoryDetail } from '../InventoryDetail';

const piece = (name: string, completed?: boolean): InventoryRoom => ({ name, condition: 'good', notes: null, ...(completed === undefined ? {} : { completed }), elements: [] });

function etatDesLieux(overrides: Partial<Inventory> = {}): Inventory {
  return {
    id: 7,
    lease_id: 3,
    property_id: 2,
    type: 'move_in',
    conducted_by: 1,
    tenant_id: 4,
    conducted_at: '2026-11-13T09:00:00Z',
    status: 'draft',
    general_condition: 'good',
    rooms: [piece('Séjour', true), piece('Cuisine', false)],
    notes: null,
    tenant_signed: false,
    tenant_signed_at: null,
    owner_signed: false,
    owner_signed_at: null,
    created_at: '2026-11-13T09:00:00Z',
    room_photos: [],
    can_sign_as: [],
    sign_on_behalf_of: null,
    abilities: { update: true },
    ...overrides,
  };
}

const ouvrir = () => render(withIntl(<InventoryDetail id={7} />));
// TCK-2648 — l'en-tête de la fiche est rendu par `InventoryDetail` lui-même (son titre nomme le logement).
const enTeteDeLaFiche = () => screen.queryByRole('heading', { level: 1, name: /État des lieux d’entrée/ });

beforeEach(() => {
  etat.piece = null;
});

describe('TCK-2647 — le brouillon et le parcours de terrain', () => {
  it('une pièce inachevée (`completed: false`) ouvre le parcours, sans l’en-tête de la page', () => {
    etat.inventory = etatDesLieux();
    ouvrir();
    expect(screen.getByTestId('parcours')).toHaveTextContent('pièce null');
    expect(enTeteDeLaFiche()).not.toBeInTheDocument();
  });

  it('toutes les pièces terminées : la page de relecture, et « Revoir les pièces » y ramène', () => {
    etat.inventory = etatDesLieux({ rooms: [piece('Séjour', true), piece('Cuisine', true)] });
    ouvrir();
    expect(screen.queryByTestId('parcours')).not.toBeInTheDocument();
    expect(enTeteDeLaFiche()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Revoir les pièces' })).toHaveAttribute('href', '/app/inventories/7?piece=1');
  });

  it('un brouillon antérieur au parcours (pièces sans `completed`) garde la page de relecture', () => {
    etat.inventory = etatDesLieux({ rooms: [piece('Séjour'), piece('Cuisine')] });
    ouvrir();
    expect(screen.queryByTestId('parcours')).not.toBeInTheDocument();
  });

  it('`?piece=2` ouvre le parcours sur cette pièce, même toutes les pièces terminées', () => {
    etat.inventory = etatDesLieux({ rooms: [piece('Séjour', true), piece('Cuisine', true)] });
    etat.piece = '2';
    ouvrir();
    expect(screen.getByTestId('parcours')).toHaveTextContent('pièce 2');
  });

  it('ni un état des lieux soumis, ni un brouillon que l’API ne laisse pas modifier', () => {
    etat.inventory = etatDesLieux({ status: 'pending_signature' });
    const { unmount } = ouvrir();
    expect(screen.queryByTestId('parcours')).not.toBeInTheDocument();
    unmount();

    etat.inventory = etatDesLieux({ abilities: { update: false } });
    etat.piece = '1';
    ouvrir();
    expect(screen.queryByTestId('parcours')).not.toBeInTheDocument();
  });
});
