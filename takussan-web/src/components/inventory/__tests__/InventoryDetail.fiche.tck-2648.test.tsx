/**
 * TCK-2648 — la fiche de l'état des lieux.
 *
 *  · AC3 — « Contester » suit l'API (`abilities.dispute`) : rendu pour le locataire et pour le bailleur,
 *    jamais pour l'agent ni l'admin — le statut seul l'offrait à tous ;
 *  · AC4 — le titre nomme le logement, sans aucun identifiant ; les deux signataires sont nommés une
 *    seule fois ; « Signé le 1 juil. 2026 » ne porte pas « 00:00 », ni une date saisie sans heure ;
 *  · le PDF une fois signé ;
 *  · `?etape=signatures` ouvre le récapitulatif à qui conduit l'état des lieux, jamais au locataire ;
 *    la fiche y renvoie par « Faire signer sur place » quand l'API rend `tenant_onsite`.
 */
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { Inventory } from '@/types/inventory';

const { etat } = vi.hoisted(() => ({ etat: { inventory: null as Inventory | null, etape: null as string | null } }));

vi.mock('@/lib/queries/inventory', () => ({
  useInventory: () => ({ data: { data: etat.inventory }, isLoading: false, isError: false, error: null, refetch: () => undefined }),
  useSubmitInventory: () => ({ mutate: vi.fn(), isPending: false }),
  useDisputeInventory: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useUploadInventoryRoomPhotos: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useDeleteInventoryRoomPhoto: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useSignInventory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(etat.etape ? { etape: etat.etape } : {}),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('../terrain/RecapEtSignatures', () => ({ RecapEtSignatures: () => <div data-testid="recap" /> }));
vi.mock('../terrain/ParcoursDeTerrain', () => ({ ParcoursDeTerrain: () => <div data-testid="parcours" /> }));

import { InventoryDetail } from '../InventoryDetail';

function signe(overrides: Partial<Inventory> = {}): Inventory {
  return {
    id: 25,
    lease_id: 208,
    property_id: 12,
    property: { id: 12, title: 'Appartement F3 · Mermoz', slug: 'f3-mermoz' },
    lease: { id: 208, reference_number: 'LS-7KQ2ME' },
    type: 'move_in',
    conducted_by: 1,
    tenant_id: 4,
    // Minuit à Dakar : une date saisie sans heure.
    conducted_at: '2026-07-01T00:00:00Z',
    status: 'signed',
    general_condition: 'good',
    rooms: [{ name: 'Séjour', condition: 'good', notes: null, elements: [] }],
    notes: null,
    tenant_signed: true,
    tenant_signed_at: '2026-07-01T00:00:00Z',
    tenant_signature_hash: 'a'.repeat(64),
    tenant_signature_method: 'onsite_otp',
    tenant_signed_via: { id: 3, full_name: 'Sokhna Sène' },
    tenant_otp_destination: '+221 77 ••• 18 90',
    owner_signed: true,
    owner_signed_at: '2026-07-01T10:42:00Z',
    owner_signature_hash: 'b'.repeat(64),
    owner_signed_by_user_id: 3,
    owner_signed_on_behalf_of_user_id: 9,
    owner_signed_by: { id: 3, full_name: 'Sokhna Sène' },
    owner_signed_on_behalf_of: { id: 9, full_name: 'Mouhamed Sène' },
    signed_at: '2026-07-01T10:42:00Z',
    created_at: '2026-07-01T00:00:00Z',
    room_photos: [],
    can_sign_as: [],
    sign_on_behalf_of: null,
    abilities: { update: true, dispute: false },
    tenant: { id: 4, full_name: 'Aminata Diop', first_name: 'Aminata' },
    landlord: { id: 9, full_name: 'Mouhamed Sène' },
    ...overrides,
  };
}

const ouvrir = () => render(withIntl(<InventoryDetail id={25} />));

beforeEach(() => {
  etat.etape = null;
});

describe('TCK-2648 — « Contester » suit l’API (AC3)', () => {
  it.each([
    ['le locataire', { update: false, dispute: true }, true],
    ['le bailleur', { update: true, dispute: true }, true],
    ['l’agent', { update: true, dispute: false }, false],
    ['l’admin de l’agence', { update: true, dispute: false }, false],
  ] as const)('%s : « Contester » %s', (_qui, abilities, rendu) => {
    etat.inventory = signe({ abilities });
    ouvrir();
    const bouton = screen.queryByRole('button', { name: 'Contester' });
    if (rendu) expect(bouton).toBeInTheDocument();
    else expect(bouton).not.toBeInTheDocument();
  });

  it('sans `abilities.dispute`, un état des lieux en attente de signature ne s’offre plus à contester', () => {
    etat.inventory = signe({ status: 'pending_signature', abilities: { update: true } });
    ouvrir();
    expect(screen.queryByRole('button', { name: 'Contester' })).not.toBeInTheDocument();
  });
});

describe('TCK-2648 — le titre et les signataires (AC4)', () => {
  it('le titre nomme le logement, sans aucun identifiant numérique', () => {
    etat.inventory = signe();
    ouvrir();
    const titre = screen.getByRole('heading', { level: 1 });
    expect(titre).toHaveTextContent('État des lieux d’entrée — Appartement F3 · Mermoz');
    // Ni l'id de l'état des lieux (25), ni celui du bien (12), ni « # » ; « F3 » est le nom du bien.
    expect(titre.textContent).not.toMatch(/#|\b(25|12)\b/);
    expect(document.body.textContent).not.toMatch(/#\s?25/);
  });

  it('sans bien connu, le titre dit le type — toujours sans « #id »', () => {
    etat.inventory = signe({ property: null, type: 'move_out' });
    ouvrir();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^État des lieux de sortie$/);
    expect(document.body.textContent).not.toMatch(/#\s?(25|12)\b/);
  });

  it('les deux signataires nommés une seule fois, et des dates sans « 00:00 »', () => {
    etat.inventory = signe();
    ouvrir();
    expect(screen.getAllByText(/Aminata Diop/)).toHaveLength(1);
    expect(screen.getAllByText(/Mouhamed Sène/)).toHaveLength(1);

    const locataire = screen.getByTestId('signature-card-tenant');
    expect(locataire).toHaveTextContent('Locataire · Aminata Diop');
    expect(locataire).toHaveTextContent('Signé le 1 juil. 2026');
    expect(locataire).toHaveTextContent('Signé sur place devant Sokhna Sène, avec le code reçu au +221 77 ••• 18 90');
    const bailleur = screen.getByTestId('signature-card-landlord');
    expect(bailleur).toHaveTextContent('Bailleur · Mouhamed Sène');
    expect(bailleur).toHaveTextContent('Signé par Sokhna Sène, au titre du mandat de gestion');

    expect(document.body.textContent).not.toMatch(/00:00/);
    // La date de réalisation saisie sans heure se dit sans heure.
    expect(screen.getByText('Réalisé le').nextElementSibling).toHaveTextContent(/^1 juil\. 2026$/);
  });

  it('une heure connue se dit', () => {
    etat.inventory = signe({ conducted_at: '2026-07-01T10:30:00Z' });
    ouvrir();
    expect(screen.getByText('Réalisé le').nextElementSibling).toHaveTextContent('10:30');
  });
});

describe('TCK-2648 — le PDF et le récapitulatif', () => {
  it('le PDF une fois signé, et pas avant', () => {
    etat.inventory = signe();
    const { unmount } = ouvrir();
    expect(screen.getByRole('button', { name: 'Télécharger le PDF' })).toBeInTheDocument();
    unmount();

    etat.inventory = signe({ status: 'pending_signature', signed_at: null, owner_signed: false, owner_signed_at: null });
    ouvrir();
    expect(screen.queryByRole('button', { name: 'Télécharger le PDF' })).not.toBeInTheDocument();
  });

  it('`?etape=signatures` ouvre le récapitulatif à qui conduit l’état des lieux, jamais au locataire', () => {
    etat.etape = 'signatures';
    etat.inventory = signe({ status: 'pending_signature', abilities: { update: true } });
    const { unmount } = ouvrir();
    expect(screen.getByTestId('recap')).toBeInTheDocument();
    unmount();

    etat.inventory = signe({ status: 'pending_signature', abilities: { update: false, dispute: true } });
    ouvrir();
    expect(screen.queryByTestId('recap')).not.toBeInTheDocument();
  });

  it('« Faire signer sur place » quand l’API rend `tenant_onsite`', () => {
    etat.inventory = signe({
      status: 'pending_signature',
      tenant_signed: false,
      owner_signed: false,
      signed_at: null,
      can_sign_as: ['tenant_onsite', 'landlord'],
      sign_on_behalf_of: { id: 9, full_name: 'Mouhamed Sène' },
    });
    const { unmount } = ouvrir();
    expect(screen.getByRole('link', { name: 'Faire signer sur place' })).toHaveAttribute('href', '/app/inventories/25?etape=signatures');
    unmount();

    etat.inventory = signe({ status: 'pending_signature', tenant_signed: false, signed_at: null, can_sign_as: ['tenant'], abilities: { update: false } });
    ouvrir();
    expect(within(document.body).queryByRole('link', { name: 'Faire signer sur place' })).not.toBeInTheDocument();
  });
});
