/**
 * TCK-2753 (AC12) — « Retirer de l'agence » sur la fiche d'un bailleur : le dialogue lit
 * `GET /api/owners/{id}/departure` ; bloqué, il dit quoi en mots et ne propose pas de confirmer ;
 * débloqué, la confirmation envoie le `DELETE` après le code (TCK-1203). Après le départ, la fiche dit
 * « Parti le … » et ne rend plus aucun geste ; le geste n'est pas rendu à qui ne peut pas retirer.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import type { OwnerProfileDetail } from '@/lib/queries/owners';
import type { OwnerDepartureInventory } from '@/lib/queries/owner-departure';
import { withIntl } from '@/test/intl';
import { AccesEtDepart } from '../AccesEtDepart';

const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

const VIDE = { properties: 0, leases: 0, positive_balance: 0, upcoming_payouts: 0, unpaid_out_pieces: 0 };

function bailleur(partiel: Partial<OwnerProfileDetail> = {}): OwnerProfileDetail {
  return {
    id: 12,
    user_id: 40,
    agency_id: 3,
    status: 'active',
    joined_at: '2025-01-10T09:00:00+00:00',
    departed_at: null,
    contact: { first_name: 'Awa', last_name: 'Ndiaye', full_name: 'Awa Ndiaye', email: 'awa@exemple.sn', phone: null },
    figures: null,
    ...partiel,
  } as OwnerProfileDetail;
}

function lecture(inventaire: OwnerDepartureInventory) {
  apiRequestMock.mockImplementation(async (chemin: string, options?: { method?: string }) => {
    if (chemin === '/api/owners/12/departure' && (options?.method ?? 'GET') === 'GET') return { data: inventaire };
    throw new Error(`appel inattendu : ${options?.method ?? 'GET'} ${chemin}`);
  });
}

function monter(owner: OwnerProfileDetail, { peutRetirer = true, peutSuspendre = true, garde = vi.fn<GardeDoubleFacteurFn>(async () => true) } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <ContexteGardeDoubleFacteur.Provider value={garde}>
          <AccesEtDepart owner={owner} agencyId={3} peutSuspendre={peutSuspendre} peutRetirer={peutRetirer} devise="XOF" nom="Awa Ndiaye" />
        </ContexteGardeDoubleFacteur.Provider>
      </QueryClientProvider>,
    ),
  );
  return garde;
}

async function ouvrir() {
  fireEvent.click(screen.getByRole('button', { name: 'Retirer de l’agence' }));
  return screen.findByRole('dialog');
}

describe('« Retirer de l’agence » (TCK-2753)', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    toastAdd.mockReset();
    refresh.mockReset();
  });

  it('bloqué : le dialogue nomme « 2 biens » et ne propose pas de confirmer', async () => {
    lecture({ blocking: { ...VIDE, properties: 2 }, balance: { remaining_to_pay: 0, as_of: '2026-11-20' }, can_depart: false });
    monter(bailleur());

    const dialogue = await ouvrir();

    expect(await within(dialogue).findByText('2 biens encore dans l’agence')).toBeInTheDocument();
    expect(within(dialogue).queryByRole('button', { name: 'Retirer de l’agence' })).not.toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
  });

  it('bloqué par l’argent : le solde dû se dit en montant, chaque raison avec son nombre', async () => {
    lecture({
      blocking: { ...VIDE, leases: 1, positive_balance: 1, upcoming_payouts: 1, unpaid_out_pieces: 3 },
      balance: { remaining_to_pay: 180000, as_of: '2026-11-20' },
      can_depart: false,
    });
    monter(bailleur());

    const dialogue = await ouvrir();
    const raisons = await within(dialogue).findByTestId('raisons-du-depart');

    expect(within(raisons).getAllByRole('listitem').map((li) => li.textContent?.replace(/[\u00a0\u202f]/g, ' '))).toEqual([
      '1 bail en cours',
      '180 000 F restent à lui verser',
      '1 reversement en cours',
      '3 encaissements pas encore reversés',
    ]);
  });

  it('débloqué : la confirmation envoie le DELETE après le code, puis la fiche est relue', async () => {
    let tentatives = 0;
    apiRequestMock.mockImplementation(async (chemin: string, options?: { method?: string }) => {
      if (chemin === '/api/owners/12/departure') return { data: { blocking: VIDE, balance: { remaining_to_pay: -30000, as_of: '2026-11-20' }, can_depart: true } };
      if (chemin === '/api/owners/12' && options?.method === 'DELETE') {
        tentatives += 1;
        if (tentatives === 1) throw new ApiError(403, { code: 'two_factor_step_up_required', message: 'Code requis.' });
        return { data: { id: 12, status: 'inactive', departed_at: '2026-11-20T10:00:00+00:00' } };
      }
      throw new Error(`appel inattendu : ${chemin}`);
    });
    const garde = monter(bailleur());

    const dialogue = await ouvrir();
    expect(await within(dialogue).findByText(/30.000.F : cette somme est à recouvrer/)).toBeInTheDocument();
    fireEvent.click(within(dialogue).getByRole('button', { name: 'Retirer de l’agence' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
    expect(tentatives).toBe(2);
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Awa Ndiaye a quitté l’agence' }));
  });

  it('un refus 422 (l’inventaire a changé) relit l’inventaire et passe à ce qui bloque', async () => {
    let lectures = 0;
    apiRequestMock.mockImplementation(async (chemin: string, options?: { method?: string }) => {
      if (chemin === '/api/owners/12/departure') {
        lectures += 1;
        return lectures === 1
          ? { data: { blocking: VIDE, balance: { remaining_to_pay: 0, as_of: '2026-11-20' }, can_depart: true } }
          : { data: { blocking: { ...VIDE, leases: 1 }, balance: { remaining_to_pay: 0, as_of: '2026-11-20' }, can_depart: false } };
      }
      if (chemin === '/api/owners/12' && options?.method === 'DELETE') {
        throw new ApiError(422, { code: 'owner.departure_not_empty', message: 'Refusé.', blocking: { ...VIDE, leases: 1 } });
      }
      throw new Error(`appel inattendu : ${chemin}`);
    });
    monter(bailleur());

    const dialogue = await ouvrir();
    fireEvent.click(await within(dialogue).findByRole('button', { name: 'Retirer de l’agence' }));

    expect(await within(dialogue).findByText('1 bail en cours')).toBeInTheDocument();
    expect(lectures).toBe(2);
    expect(within(dialogue).queryByRole('button', { name: 'Retirer de l’agence' })).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('parti : la fiche dit « Parti le … » et ne rend plus aucun geste', () => {
    monter(bailleur({ status: 'inactive', departed_at: '2026-11-20T10:00:00+00:00' }));

    expect(screen.getByTestId('bailleur-parti')).toHaveTextContent('Parti le 20 novembre 2026');
    expect(screen.queryByRole('button', { name: 'Retirer de l’agence' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspendre l’accès' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réactiver' })).not.toBeInTheDocument();
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('le geste n’est pas rendu à qui ne peut pas retirer (un agent)', () => {
    monter(bailleur(), { peutRetirer: false });

    expect(screen.getByRole('button', { name: 'Suspendre l’accès' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer de l’agence' })).not.toBeInTheDocument();
  });

  it('la suspension reste séparée, au-dessus du retrait', () => {
    monter(bailleur());

    const boutons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(boutons).toEqual(['Suspendre l’accès', 'Retirer de l’agence']);
  });
});
