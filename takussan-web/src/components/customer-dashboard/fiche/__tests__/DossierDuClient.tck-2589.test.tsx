/**
 * TCK-2589 (lot D) — le dossier de la fiche client (les anciens onglets, en lignes repliées) :
 *  · AC5 / 2a — une ligne vide est ABSENTE (Documents, Relations, Réservations, Baux à 0), Tâches
 *    reste ; Biens correspondants dès qu'il y a une recherche ;
 *  · 5a — une ligne ouverte à la fois, dans l'URL (`?section=`), rouverte et amenée à l'écran au retour ;
 *  · le bailleur auteur : ni Réservations ni Baux (leurs comptes ne lui sont pas servis) ;
 *  · la pièce : masquée hors admin, sans geste « Afficher » ;
 *  · TCK-586 — une relation se dit par un libellé traduit, jamais par son code (repris de l'onglet).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { CustomerDetail, CustomerRelationship } from '@/types/customer';

const nav = vi.hoisted(() => ({ replace: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => '/app/customers/7',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1 }, isLoading: false }) }));
vi.mock('@/components/crm/CustomerMatches', () => ({ CustomerMatches: () => <p>contenu biens</p> }));
vi.mock('@/components/crm/CustomerTasksPanel', () => ({ CustomerTasksPanel: () => <p>contenu tâches</p> }));
vi.mock('@/components/crm/CustomerLinkedRecords', () => ({ CustomerLinkedRecords: ({ kind }: { kind: string }) => <p>contenu {kind}</p> }));
const invitation = vi.hoisted(() => ({ etat: 'aucune' as 'aucune' | 'envoyee' | 'expiree', actif: [] as boolean[] }));
vi.mock('@/components/crm/InviterACreerSonCompte', () => ({
  InviterACreerSonCompte: () => <button type="button">inviter</button>,
  useInvitationDuClient: (_id: number, actif: boolean) => {
    invitation.actif.push(actif);
    return { etat: invitation.etat };
  },
}));
vi.mock('@/components/customer-dashboard/CustomerDocumentsPanel', () => ({ CustomerDocumentsPanel: () => <p>contenu documents</p> }));
vi.mock('@/components/customer-form/RevelationNumeroDePiece', () => ({ RevelationNumeroDePiece: () => <button type="button">Afficher</button> }));

const lectures = vi.hoisted(() => ({ taches: vi.fn(), correspondances: vi.fn() }));
vi.mock('@/lib/queries/pipeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/pipeline')>()),
  fetchCustomerTasks: (...a: unknown[]) => lectures.taches(...a),
}));
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchMatchingProperties: (...a: unknown[]) => lectures.correspondances(...a),
}));

import { DossierDuClient } from '../DossierDuClient';

const SANS_RIEN = {
  id: 7,
  first_name: 'Mariama',
  last_name: 'Fall',
  phone: '+221706482056',
  seeking_contract_type: null,
  seeking_property_types: [],
  seeking_cities: [],
  seeking_neighborhoods: [],
  budget_max: null,
  documents: [],
  id_type: null,
  id_number_masked: null,
  user_id: 3,
  visits_count: 0,
  bookings_count: 0,
  leases_count: 0,
} as unknown as CustomerDetail;

const COMPLET = {
  ...SANS_RIEN,
  seeking_contract_type: 'rent',
  budget_max: '250000.00',
  documents: [{ id: 1, name: 'CNI recto.pdf' }],
  id_type: 'id_card',
  id_number_masked: '•••• 4821',
  user_id: null,
  bookings_count: 2,
  leases_count: 1,
} as unknown as CustomerDetail;

function relation(id: number, relationship_type: string): CustomerRelationship {
  return {
    id,
    user_id: 1,
    customer_id: 7,
    relationship_type,
    is_primary: false,
    status: 'active',
    start_date: '2026-01-01T00:00:00Z',
    end_date: null,
    notes: null,
  } as CustomerRelationship;
}

function rendu(
  customer: CustomerDetail,
  { relationships = [], peutInviter = true, peutReveler = false }: { relationships?: CustomerRelationship[]; peutInviter?: boolean; peutReveler?: boolean } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <DossierDuClient customer={customer} relationships={relationships} peutInviter={peutInviter} peutReveler={peutReveler} />
      </QueryClientProvider>,
    ),
  );
}

const lignes = () => [...document.querySelectorAll('[data-slot="ligne-du-dossier"]')].map((l) => l.getAttribute('data-section'));
const ligne = (section: string) => document.querySelector(`[data-slot="ligne-du-dossier"][data-section="${section}"]`) as HTMLElement;
const bouton = (section: string) => within(ligne(section)).getAllByRole('button')[0];

beforeEach(() => {
  vi.clearAllMocks();
  invitation.etat = 'aucune';
  invitation.actif = [];
  nav.params = new URLSearchParams();
  lectures.taches.mockResolvedValue([{ id: 1, status: 'open' }, { id: 2, status: 'done' }]);
  lectures.correspondances.mockResolvedValue({ data: [], meta: { total: 4, per_page: 20, current_page: 1, last_page: 1 } });
});

describe('TCK-2589 (lot D) — le dossier de la fiche client', () => {
  it('AC5 — sans rien à montrer, seule la ligne Tâches reste (pas de « 0 »)', async () => {
    rendu(SANS_RIEN);
    expect(lignes()).toEqual(['taches']);
    expect(screen.queryByText('Documents')).toBeNull();
    expect(screen.queryByText('Réservations')).toBeNull();
    expect(screen.queryByText('Baux')).toBeNull();
    expect(screen.queryByText('Relations')).toBeNull();
    expect(screen.queryByText('Biens correspondants')).toBeNull();
    // Sans recherche, aucun rapprochement n'est demandé.
    expect(lectures.correspondances).not.toHaveBeenCalled();
    expect(await within(ligne('taches')).findByText('1 ouverte')).toBeInTheDocument();
  });

  it('les lignes présentes, dans l’ordre, avec leurs comptes', async () => {
    rendu(COMPLET, { relationships: [relation(1, 'owner_tenant')] });
    expect(lignes()).toEqual(['biens', 'taches', 'documents', 'relations', 'reservations', 'baux', 'piece', 'compte']);
    expect(await within(ligne('biens')).findByText('4')).toBeInTheDocument();
    expect(within(ligne('documents')).getByText('CNI recto.pdf')).toBeInTheDocument();
    expect(within(ligne('reservations')).getByText('2')).toBeInTheDocument();
    expect(within(ligne('baux')).getByText('1')).toBeInTheDocument();
    expect(within(ligne('compte')).getByText('Inviter')).toBeInTheDocument();
  });

  it('le bailleur auteur : ni Réservations ni Baux, ni Compte client sans le geste d’inviter', () => {
    const { bookings_count: _b, leases_count: _l, visits_count: _v, ...pourLeBailleur } = COMPLET;
    rendu(pourLeBailleur as CustomerDetail, { peutInviter: false });
    expect(lignes()).toEqual(['biens', 'taches', 'documents', 'piece']);
  });

  it('5a — une ligne s’ouvre au toucher, par l’URL, sans défilement ; un second toucher la referme', async () => {
    rendu(COMPLET);
    expect(bouton('documents')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('contenu documents')).toBeNull();
    await userEvent.click(bouton('documents'));
    expect(nav.replace).toHaveBeenLastCalledWith('?section=documents', { scroll: false });
  });

  it('5a — au retour, la ligne de l’URL est ouverte, seule, et amenée à l’écran', () => {
    nav.params = new URLSearchParams('section=reservations');
    // jsdom ne l'implémente pas : un espion posé sur le prototype le temps du test.
    const amener = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: amener, configurable: true, writable: true });
    rendu(COMPLET);
    expect(bouton('reservations')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('contenu bookings')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="ligne-du-dossier"] [aria-expanded="true"]')).toHaveLength(1);
    expect(amener).toHaveBeenCalledTimes(1);
    expect(amener.mock.contexts[0]).toBe(ligne('reservations'));
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('5a — rouverte, un toucher la referme (la clé quitte l’URL) ; une section inconnue ou absente n’ouvre rien', async () => {
    nav.params = new URLSearchParams('section=baux');
    const { unmount } = rendu(COMPLET);
    await userEvent.click(bouton('baux'));
    expect(nav.replace).toHaveBeenLastCalledWith('?', { scroll: false });
    unmount();

    nav.params = new URLSearchParams('section=baux');
    rendu(SANS_RIEN);
    expect(document.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
  });

  it('la pièce : masquée, sans « Afficher », hors admin ; l’admin a le geste', async () => {
    nav.params = new URLSearchParams('section=piece');
    const { unmount } = rendu(COMPLET);
    expect(within(ligne('piece')).getByTestId('numero-de-piece')).toHaveTextContent('•••• 4821');
    expect(within(ligne('piece')).queryByRole('button', { name: 'Afficher' })).toBeNull();
    unmount();

    rendu(COMPLET, { peutReveler: true });
    expect(within(ligne('piece')).getByRole('button', { name: 'Afficher' })).toBeInTheDocument();
  });

  it('TCK-586 — le type d’une relation par son libellé, et un type inconnu par un libellé neutre', () => {
    nav.params = new URLSearchParams('section=relations');
    rendu(COMPLET, { relationships: [relation(1, 'owner_tenant'), relation(2, 'guarantor_client')] });
    const contenu = ligne('relations');
    expect(within(contenu).getAllByText('Bailleur / locataire').length).toBeGreaterThan(0);
    expect(within(contenu).getByText('Autre relation')).toBeInTheDocument();
    expect(within(contenu).queryByText(/owner|guarantor/)).toBeNull();
  });

  it('TCK-2668 (AC4) — la ligne repliée « Compte client » dit l’état de l’invitation', () => {
    invitation.etat = 'expiree';
    const { unmount } = rendu(COMPLET);
    expect(within(ligne('compte')).getByText('Invitation expirée')).toBeInTheDocument();
    unmount();
    invitation.etat = 'envoyee';
    rendu(COMPLET);
    expect(within(ligne('compte')).getByText('Invitation envoyée')).toBeInTheDocument();
  });

  it('TCK-2668 — l’invitation ne se lit que si la ligne « Compte client » existe', () => {
    rendu(SANS_RIEN);
    expect(invitation.actif.every((a) => a === false)).toBe(true);
  });
});
