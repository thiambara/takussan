/**
 * TCK-2647 — l'écran « Démarrer » (maquette a-0) : le type DÉDUIT du bail, les pièces du modèle
 * pré-cochées, et « Commencer » qui crée le brouillon avec les pièces cochées, chaque élément SANS
 * état (AC3 : rien ne part qualifié « Bon » par défaut). Une sortie d'un bail dont l'entrée est
 * signée reprend les pièces de l'entrée, chaque élément à son état d'entrée, et la nomme
 * (`from_inventory_id`).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { Inventory, InventoryTemplate } from '@/types/inventory';

const { etat, create, routeur } = vi.hoisted(() => ({
  etat: {
    bail: null as unknown,
    modele: null as InventoryTemplate | null,
    entreeSignee: null as { id: number } | null,
    entree: null as Inventory | null,
    requetesDuModele: [] as unknown[],
  },
  create: { mutateAsync: vi.fn(), isPending: false },
  routeur: { push: vi.fn(), replace: vi.fn(), back: vi.fn() },
}));

const requete = <T,>(data: T | undefined) => ({ data, isLoading: false, isError: false, error: null, refetch: () => undefined });

vi.mock('@/lib/queries/inventory', async (importOriginal) => ({
  parametresDuModele: (await importOriginal<typeof import('@/lib/queries/inventory')>()).parametresDuModele,
  useContexteDuBail: () => requete({ data: etat.bail }),
  useEntreeSignee: (_id: number, enabled: boolean) => requete(enabled ? { data: etat.entreeSignee ? [etat.entreeSignee] : [] } : undefined),
  useInventory: (id: number | null) => requete(id !== null && etat.entree ? { data: etat.entree } : undefined),
  useInventoryTemplate: (q: unknown) => {
    etat.requetesDuModele.push(q);
    return requete(etat.modele ? { data: etat.modele } : undefined);
  },
  useCreateInventory: () => create,
}));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

import { Demarrer } from '../Demarrer';

const MODELE_F3: InventoryTemplate = {
  key: 'f3',
  property_type: 'apartment',
  rooms: [
    { key: 'sejour', name: 'Séjour', elements: [{ key: 'murs', label: 'Murs' }, { key: 'sol', label: 'Sol' }] },
    { key: 'cuisine', name: 'Cuisine', elements: [{ key: 'evier', label: 'Évier' }] },
    { key: 'chambre_1', name: 'Chambre 1', elements: [{ key: 'murs', label: 'Murs' }, { key: 'placard', label: 'Placard' }, { key: 'fenetre', label: 'Fenêtre' }] },
  ],
};

function bail(status: string) {
  return {
    id: 208,
    reference_number: 'BL-208',
    status,
    start_date: '2026-01-01',
    end_date: null,
    deposit_amount: '150000.00',
    property_id: 31,
    property: { id: 31, title: 'F3 Grand Yoff', type: 'apartment', bedrooms: 2, main_photo_url: null },
    tenant: { first_name: 'Yacine', last_name: 'Ndiaye' },
  };
}

const commencer = () => screen.getAllByRole('button', { name: /^Commencer/ })[0];

/** Le corps du `POST` envoyé. */
const corps = () => create.mutateAsync.mock.calls.at(-1)?.[0] as Record<string, unknown> & { rooms: Array<{ name: string; completed: boolean; elements: Array<{ label: string; state: string | null }> }> };

beforeEach(() => {
  etat.bail = bail('active');
  etat.modele = MODELE_F3;
  etat.entreeSignee = null;
  etat.entree = null;
  etat.requetesDuModele = [];
  create.mutateAsync.mockReset().mockResolvedValue({ data: { id: 501 } });
  routeur.push.mockReset();
});

describe('TCK-2647 — Démarrer', () => {
  it('lit le modèle DU BIEN, pré-coche ses pièces et compte pièces et éléments', () => {
    render(withIntl(<Demarrer leaseId={208} />));
    expect(etat.requetesDuModele[0]).toEqual({ property_id: '31' });
    const cases = screen.getAllByRole('checkbox');
    expect(cases).toHaveLength(3);
    for (const c of cases) expect(c).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('3 pièces')).toBeInTheDocument();
    expect(screen.getByText(/6 éléments proposés/)).toBeInTheDocument();
    expect(commencer()).toHaveTextContent('Commencer : Séjour');
  });

  it('un bail en cours ouvre une ENTRÉE, un bail en préavis une SORTIE, et `?type=` l’emporte', () => {
    const { unmount } = render(withIntl(<Demarrer leaseId={208} />));
    expect(screen.getByRole('radio', { name: 'Entrée' })).toHaveAttribute('aria-checked', 'true');
    unmount();

    etat.bail = bail('terminating');
    const second = render(withIntl(<Demarrer leaseId={208} />));
    expect(screen.getByRole('radio', { name: 'Sortie' })).toHaveAttribute('aria-checked', 'true');
    second.unmount();

    render(withIntl(<Demarrer leaseId={208} typeDemande="move_in" />));
    expect(screen.getByRole('radio', { name: 'Entrée' })).toHaveAttribute('aria-checked', 'true');
  });

  it('« Commencer » crée le brouillon avec les pièces COCHÉES, leurs éléments sans état, puis ouvre la première pièce', async () => {
    const user = userEvent.setup();
    render(withIntl(<Demarrer leaseId={208} />));
    await user.click(screen.getAllByRole('checkbox')[1]); // décoche la Cuisine
    expect(screen.getByText('2 pièces')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Autre pièce' }));
    const nom = screen.getByRole('textbox', { name: 'Nom de la pièce' });
    expect(nom).toHaveFocus();
    await user.type(nom, 'Terrasse{Enter}');

    await user.click(commencer());
    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));
    const envoye = corps();
    expect(envoye).toMatchObject({ lease_id: 208, type: 'move_in', general_condition: 'good' });
    expect(envoye).not.toHaveProperty('from_inventory_id');
    expect(envoye.rooms.map((r) => r.name)).toEqual(['Séjour', 'Chambre 1', 'Terrasse']);
    expect(envoye.rooms.every((r) => r.completed === false)).toBe(true);
    expect(envoye.rooms[0].elements).toEqual([
      { label: 'Murs', state: null, notes: null },
      { label: 'Sol', state: null, notes: null },
    ]);
    expect(envoye.rooms[2].elements).toEqual([]);
    expect(routeur.push).toHaveBeenCalledWith('/app/inventories/501');
  });

  it('une SORTIE après une entrée signée reprend ses pièces, chaque élément à son état d’entrée, et la nomme', async () => {
    const user = userEvent.setup();
    etat.bail = bail('terminating');
    etat.entreeSignee = { id: 19 };
    etat.entree = {
      id: 19,
      lease_id: 208,
      property_id: 31,
      type: 'move_in',
      conducted_by: 1,
      tenant_id: 4,
      conducted_at: '2026-01-02T10:00:00Z',
      status: 'signed',
      general_condition: 'fair',
      rooms: [
        { name: 'Séjour', condition: 'good', notes: 'RAS', elements: [{ label: 'Murs', state: 'bon', notes: 'blanc' }, { label: 'Sol', state: 'usé', notes: null }] },
        { name: 'Cuisine', condition: 'fair', notes: null, elements: [{ label: 'Évier', state: 'bon', notes: null }] },
      ],
      notes: null,
      tenant_signed: true,
      tenant_signed_at: null,
      owner_signed: true,
      owner_signed_at: null,
      created_at: '2026-01-02T10:00:00Z',
    };
    render(withIntl(<Demarrer leaseId={208} />));
    expect(screen.getByText(/Les pièces de l’entrée signée sont reprises/)).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);

    await user.click(commencer());
    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));
    const envoye = corps();
    expect(envoye).toMatchObject({ type: 'move_out', from_inventory_id: 19, general_condition: 'fair' });
    expect(envoye.rooms[0]).toMatchObject({ name: 'Séjour', completed: false, notes: null });
    expect(envoye.rooms[0].elements).toEqual([
      { label: 'Murs', state: 'bon', notes: null },
      { label: 'Sol', state: 'usé', notes: null },
    ]);
  });

  it('un refus de l’API se dit et ne quitte pas l’écran', async () => {
    const user = userEvent.setup();
    create.mutateAsync.mockRejectedValueOnce(new Error('réseau'));
    render(withIntl(<Demarrer leaseId={208} />));
    await user.click(commencer());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(routeur.push).not.toHaveBeenCalled();
  });

  it('sans aucune pièce cochée, « Commencer » est désactivé', async () => {
    const user = userEvent.setup();
    render(withIntl(<Demarrer leaseId={208} />));
    for (const c of screen.getAllByRole('checkbox')) await user.click(c);
    expect(commencer()).toBeDisabled();
  });
});
