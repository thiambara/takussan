import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { InventoryList } from '../InventoryList';
import type { Inventory } from '@/types/inventory';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const etatDeLaListe = vi.hoisted(() => ({ lignes: [] as unknown[] }));

vi.mock('@/lib/queries/inventory', () => ({
  useInventories: () => ({
    isLoading: false,
    isError: false,
    error: null,
    data: {
      data: etatDeLaListe.lignes,
      meta: { current_page: 1, last_page: 1, total: etatDeLaListe.lignes.length, per_page: 20 },
    },
    refetch: vi.fn(),
  }),
}));

function bail(id: number): Inventory {
  return {
    id,
    lease_id: id,
    property_id: id,
    type: 'move_in',
    status: 'draft',
    conducted_by: 1,
    tenant_id: 2,
    conducted_at: null,
    general_condition: 'good',
    rooms: [],
    notes: null,
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-01T10:00:00Z',
  } as unknown as Inventory;
}

function monte(canCreate: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <InventoryList canCreate={canCreate} />
      </QueryClientProvider>,
    ),
  );
}

function liensVers(href: string): HTMLElement[] {
  return screen.getAllByRole('link').filter((a) => a.getAttribute('href') === href);
}

/**
 * TCK-379 — AC2 : le geste de création existe sur `/app/inventories`, y compris LISTE PEUPLÉE.
 *
 * L'écran n'offrait aucun geste de création : l'état vide renvoyait vers `/app/leases` (une
 * autre section), et la liste peuplée n'avait rien du tout. §1.9 de `docs/features.md` donne
 * pourtant « Créer un inventaire d'entrée ou de sortie » en P1 à l'agent.
 *
 * ⚠ Le premier test monte une liste NON VIDE, et c'est le point : un bouton qui n'existerait que
 * dans l'état vide le coche… sur l'écran que l'agent ne voit jamais après son premier
 * inventaire.
 */
describe('InventoryList — geste de création (TCK-379)', () => {
  beforeEach(() => {
    etatDeLaListe.lignes = [];
  });

  it('offre la création sur une liste NON VIDE quand le rôle y a droit', () => {
    etatDeLaListe.lignes = [bail(1), bail(2)];
    monte(true);

    // La liste est bien peuplée — sans quoi le test cocherait l'état vide sans le dire.
    expect(screen.getAllByRole('link').some((a) => a.getAttribute('href') === '/app/inventories/1')).toBe(true);
    expect(liensVers('/app/inventories/new')).toHaveLength(1);
  });

  it('offre la même création sur une liste VIDE', () => {
    etatDeLaListe.lignes = [];
    monte(true);
    expect(liensVers('/app/inventories/new').length).toBeGreaterThan(0);
    // Et plus le renvoi vers une autre section, qui était le défaut nommé par le ticket.
    expect(liensVers('/app/leases')).toHaveLength(0);
  });

  it('n’ouvre la création à aucun rôle qui ne l’avait pas', () => {
    // Le pendant obligatoire : « rien ici n'élargit un accès ». Sans cette assertion, un
    // correctif qui montrerait le bouton à tout le monde cocherait quand même les deux
    // précédentes.
    etatDeLaListe.lignes = [bail(1)];
    monte(false);
    expect(liensVers('/app/inventories/new')).toHaveLength(0);
  });

  it('garde le renvoi vers les baux pour qui ne peut pas créer, sur liste vide', () => {
    etatDeLaListe.lignes = [];
    monte(false);
    expect(liensVers('/app/leases').length).toBeGreaterThan(0);
  });
});
