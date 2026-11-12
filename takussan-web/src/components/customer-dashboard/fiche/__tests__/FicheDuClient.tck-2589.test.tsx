/**
 * TCK-2589 — la fiche client, son résumé (lot B) :
 *  · AC1 — la tête dit l'étape, le référent, les gestes et la prochaine visite ;
 *  · AC3 — UN seul contrôle d'étape dans le DOM, et il garde le motif d'une étape terminale (4a) ;
 *  · 1a — « Confirmer » n'existe que si la visite le permet à ce lecteur, et son refus se dit ;
 *  · 3a — la tâche suivante n'apparaît qu'une fois les tâches lues ;
 *  · 4a — le nombre de biens correspondants vient de `meta.total`, sinon la rangée reste sans nombre ;
 *  · le bailleur auteur : ni gestes enregistrés, ni origine, ni visite ;
 *  · lot D — les actions secondaires (« Modifier », ⋯ : saisir une demande, ajouter un document), au
 *    bureau et dans la feuille du ⋯ de l'en-tête ; un document ajouté relit la page et ouvre sa ligne.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { withIntl } from '@/test/intl';
import type { CustomerDetail } from '@/types/customer';

const nav = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: nav.refresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/customers/7',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1 }, isLoading: false }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: false, isLoading: false }) }));
// L'en-tête de la coque rend ses `actions` dans la feuille du ⋯ (EnTeteMobile) : la même primitive ici.
vi.mock('@/components/layout/en-tete-de-la-coque', async () => {
  const { FeuilleDuBas } = await import('@/components/ui/feuille-du-bas');
  return {
    DeclarerEnTete: ({ actions }: { actions?: ReactNode }) =>
      actions ? <FeuilleDuBas titre="Plus d’actions" declencheur={<button type="button">⋯ de l’en-tête</button>}>{actions}</FeuilleDuBas> : null,
  };
});
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierUneVisite: () => <button type="button">Planifier une visite</button> }));
vi.mock('@/components/bookings/SaisirUneDemande', () => ({
  SaisirUneDemande: ({ open }: { open: boolean }) => (open ? <p>saisie de la demande ouverte</p> : null),
}));
vi.mock('@/components/documents/DocumentUploadDialog', () => ({
  DocumentUploadDialog: ({ open, onUploaded }: { open: boolean; onUploaded?: () => void }) =>
    open ? <button type="button" onClick={onUploaded}>déposer le document</button> : null,
}));
vi.mock('@/components/customer-form', () => ({ CustomerForm: () => <p>formulaire de la fiche</p> }));
vi.mock('@/components/crm/InviterACreerSonCompte', () => ({ InviterACreerSonCompte: () => null }));
vi.mock('@/components/customer-dashboard/CustomerTagPicker', () => ({ CustomerTagPicker: () => null }));
const role = vi.hoisted(() => ({ personnel: true }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => role.personnel }));
vi.mock('@/lib/queries/customer-timeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/customer-timeline')>()),
  fetchCustomerTimeline: async () => ({ data: [], meta: { total: 0, per_page: 20, current_page: 1, last_page: 1 } }),
}));

const geste = vi.hoisted(() => ({ mutate: vi.fn(), isError: false }));
vi.mock('@/lib/queries/customer-gestures', () => ({ useEnregistrerContactClient: () => geste }));

const visites = vi.hoisted(() => ({
  // C2 — la fiche ne lit plus la visite : « Confirmer » se décide sur `upcoming_visits` seul.
  detail: vi.fn(),
  confirmer: { mutate: vi.fn(), isPending: false, isError: false, error: null as unknown },
}));
vi.mock('@/lib/queries/visits', () => ({
  useVisit: (...a: unknown[]) => visites.detail(...a),
  useConfirmVisit: () => visites.confirmer,
}));

const lectures = vi.hoisted(() => ({
  taches: vi.fn(),
  correspondances: vi.fn(),
  etape: vi.fn(),
}));
vi.mock('@/lib/queries/pipeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/pipeline')>()),
  fetchCustomerTasks: (...a: unknown[]) => lectures.taches(...a),
  patchCustomerPipelineStage: (...a: unknown[]) => lectures.etape(...a),
}));
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchMatchingProperties: (...a: unknown[]) => lectures.correspondances(...a),
  fetchAgencyAgents: async () => [],
}));

import { FicheDuClient } from '../FicheDuClient';

const MARIAMA: CustomerDetail = {
  id: 7,
  first_name: 'Mariama',
  last_name: 'Fall',
  email: 'mariama.fall@example.test',
  phone: '+221706482056',
  status: 'active',
  pipeline_stage: 'prospect',
  created_at: '2026-11-03T10:00:00Z',
  seeking_contract_type: 'rent',
  budget_max: '250000.00',
  seeking_property_types: ['studio'],
  seeking_cities: ['Dakar'],
  seeking_neighborhoods: ['Mermoz', 'Ouakam'],
  next_action: { type: 'visit', id: 3, at: '2030-11-14T10:00:00Z', label: 'Studio meublé · Mermoz', overdue: false },
  follow_up: null,
  referent: { id: 2, name: 'Khady Diallo' },
  birth_date: null,
  id_type: null,
  id_number_masked: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  added_by_id: 2,
  user_id: null,
  metadata: null,
  agency_id: 4,
  origin: { contact_lead_id: 5, received_at: '2026-11-03T14:31:00Z', message: 'Une visite samedi est-elle possible ?', property: { id: 9, title: 'Studio meublé · Mermoz', slug: 's' } },
  upcoming_visits: [{ id: 3, property_id: 9, status: 'scheduled', scheduled_at: '2030-11-14T10:00:00Z', preferred_window: null, manage: true }],
  visits_count: 1,
  bookings_count: 0,
  leases_count: 0,
  tags: [],
};

/** La fiche telle que l'API la rend au bailleur auteur : sans les faits de l'agence. */
const POUR_LE_BAILLEUR: CustomerDetail = (() => {
  const { origin: _o, upcoming_visits: _u, visits_count: _v, bookings_count: _b, leases_count: _l, ...reste } = MARIAMA;
  return { ...reste, next_action: null, referent: null };
})();

function rendu(customer: CustomerDetail = MARIAMA) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <FicheDuClient customer={customer} relationships={[]} suggestionsDEtiquettes={[]} notes={[]} peutInviter peutReveler={false} />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  role.personnel = true;
  geste.isError = false;
  visites.confirmer.isError = false;
  visites.confirmer.error = null;
  lectures.taches.mockResolvedValue([]);
  lectures.correspondances.mockResolvedValue({ data: [{ id: 1 }], meta: { total: 3, per_page: 20, current_page: 1, last_page: 1 } });
  lectures.etape.mockResolvedValue({});
});

describe('TCK-2589 — la tête et le résumé de la fiche client', () => {
  it('AC1 — l’étape, le référent, les gestes et la prochaine visite', async () => {
    rendu();
    const tete = screen.getByRole('banner');
    expect(within(tete).getByRole('heading', { level: 1, name: 'Mariama Fall' })).toBeInTheDocument();
    expect(within(tete).getByRole('combobox', { name: 'Étape de Mariama Fall' })).toHaveTextContent('Prospect');
    expect(within(tete).getByText('référent Khady D.')).toBeInTheDocument();
    expect(within(tete).getByRole('link', { name: 'Appeler Mariama Fall' })).toHaveAttribute('href', 'tel:+221706482056');
    expect(within(tete).getByRole('link', { name: /WhatsApp/ })).toBeInTheDocument();

    const prochaine = document.querySelector('[data-slot="prochaine-action"]') as HTMLElement;
    expect(within(prochaine).getByText(/^Visite .+ · \d{2}:\d{2}$/)).toBeInTheDocument();
    expect(within(prochaine).getByText('Studio meublé · Mermoz')).toBeInTheDocument();
    expect(within(prochaine).getByText('À confirmer')).toBeInTheDocument();
  });

  it('AC3 — un seul contrôle d’étape, et une étape terminale demande son motif (4a)', async () => {
    rendu();
    expect(screen.getAllByTestId('customer-stage-control')).toHaveLength(1);
    expect(screen.getAllByRole('combobox', { name: /^Étape de / })).toHaveLength(1);

    await userEvent.click(screen.getByRole('combobox', { name: 'Étape de Mariama Fall' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Converti' }));
    expect(lectures.etape).not.toHaveBeenCalled();
    await userEvent.type(await screen.findByTestId('reason-input'), 'Bail signé');
    await userEvent.click(screen.getByTestId('reason-submit'));
    await waitFor(() => expect(lectures.etape).toHaveBeenCalledWith('jeton', 7, 'converted', 'Bail signé'));
  });

  it('1a — « Confirmer » confirme la visite quand la visite le permet, puis la fiche se relit', async () => {
    visites.confirmer.mutate.mockImplementation((_v: unknown, o?: { onSuccess?: () => void }) => o?.onSuccess?.());
    rendu();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(visites.confirmer.mutate).toHaveBeenCalledTimes(1);
    expect(nav.refresh).toHaveBeenCalled();
    // Aucune lecture de la visite (son visiteur, sa fiche) pour décider d'un bouton.
    expect(visites.detail).not.toHaveBeenCalled();
  });

  it('1a — sans le droit de gérer la visite, aucun « Confirmer »', () => {
    rendu({ ...MARIAMA, upcoming_visits: [{ ...MARIAMA.upcoming_visits![0], manage: false }] });
    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull();
    expect(screen.getByText('À confirmer')).toBeInTheDocument();
  });

  it('1a — une demande par tranche se confirme sur sa fiche, où l’heure se choisit', () => {
    rendu({ ...MARIAMA, upcoming_visits: [{ ...MARIAMA.upcoming_visits![0], preferred_window: 'morning' }] });
    expect(screen.queryByRole('button', { name: 'Confirmer' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Fixer l’heure' })).toHaveAttribute('href', '/app/visits/3');
  });

  it('1a — le refus de l’API se dit sous le bouton', () => {
    visites.confirmer.isError = true;
    visites.confirmer.error = new ApiError(403, { message: 'Cette visite ne peut pas être confirmée par vous.' });
    rendu();
    expect(screen.getByRole('alert')).toHaveTextContent(/.+/);
  });

  it('3a — la tâche suivante apparaît une fois lues les tâches, et rien avant', async () => {
    let lire: (v: unknown) => void = () => {};
    lectures.taches.mockReturnValue(new Promise((r) => { lire = r; }));
    rendu();
    const prochaine = document.querySelector('[data-slot="prochaine-action"]') as HTMLElement;
    expect(within(prochaine).queryByText('Relancer après la visite')).toBeNull();
    lire([{ id: 11, title: 'Relancer après la visite', status: 'open', priority: 'medium', due_at: '2030-11-15T09:00:00Z', taskable_id: 7, taskable_type: 'App\\Models\\Customer', completed_at: null, created_at: '2026-11-03T10:00:00Z' }]);
    expect(await within(prochaine).findByText('Relancer après la visite')).toBeInTheDocument();
  });

  it('4a — le nombre de biens correspondants vient de meta.total ; inconnu, la rangée reste sans nombre', async () => {
    const { unmount } = rendu();
    expect(await screen.findByText('3 biens correspondent')).toBeInTheDocument();
    unmount();

    lectures.correspondances.mockRejectedValue(new ApiError(403, {}));
    rendu();
    await waitFor(() => expect(lectures.correspondances).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    const rangee = document.querySelector('[data-slot="biens-correspondants"]') as HTMLElement;
    expect(rangee).toHaveTextContent('Biens correspondants');
    expect(screen.queryByText(/biens? correspond/)).toBeNull();
  });

  it('l’origine cite le message de la demande', () => {
    rendu();
    expect(screen.getByText('« Une visite samedi est-elle possible ? »')).toBeInTheDocument();
  });

  it('le bailleur auteur : ses gestes ne sont pas enregistrés, ni origine ni visite', async () => {
    rendu(POUR_LE_BAILLEUR);
    expect(screen.queryByText('Origine')).toBeNull();
    expect(screen.getByText('Rien de prévu.')).toBeInTheDocument();
    expect(screen.queryByText(/^référent /)).toBeNull();
    const appeler = screen.getByRole('link', { name: 'Appeler Mariama Fall' });
    appeler.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(appeler);
    expect(geste.mutate).not.toHaveBeenCalled();
  });

  it('la barre du bas ouvre la saisie du fil dans le mode touché ; « Visite » au seul personnel actif', async () => {
    rendu();
    const barre = document.querySelector('[data-slot="barre-d-action"]') as HTMLElement;
    const saisie = () => document.querySelector('[data-slot="saisie-du-fil"]') as HTMLElement;
    expect(saisie().className).toMatch(/max-md:hidden/);
    await userEvent.click(within(barre).getByRole('button', { name: 'Tâche' }));
    expect(saisie().className).not.toMatch(/max-md:hidden/);
    expect(within(saisie()).getByRole('button', { name: 'Tâche' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(barre).getByRole('button', { name: 'Visite' })).toBeInTheDocument();
  });

  it('le personnel : Appeler est enregistré sur la fiche', async () => {
    rendu();
    const appeler = screen.getByRole('link', { name: 'Appeler Mariama Fall' });
    appeler.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(appeler);
    expect(geste.mutate).toHaveBeenCalledWith({ id: 7, channel: 'call' });
  });
});

describe('TCK-2589 (lot D) — les actions secondaires de la fiche', () => {
  it('7a — au bureau, « Modifier » ouvre la feuille d’édition ; ⋯ porte la saisie et le document, plus d’inviter en tête', async () => {
    rendu();
    const tete = screen.getByRole('banner');
    expect(within(tete).queryByRole('button', { name: /Inviter/ })).toBeNull();
    const bureau = document.querySelector('[data-slot="actions-du-bureau"]') as HTMLElement;
    expect(bureau.className).toMatch(/max-md:hidden/);

    await userEvent.click(within(bureau).getByRole('button', { name: 'Modifier' }));
    const feuille = await screen.findByRole('dialog', { name: 'Modifier la fiche' });
    expect(within(feuille).getByText('formulaire de la fiche')).toBeInTheDocument();
  });

  it('7a — le ⋯ du bureau : « Saisir » au seul personnel actif, « Ajouter un document » à tous', async () => {
    rendu();
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /candidature ou une offre/ }));
    expect(await screen.findByText('saisie de la demande ouverte')).toBeInTheDocument();
  });

  it('7a — sans être du personnel actif, le ⋯ n’offre que le document', async () => {
    role.personnel = false;
    rendu();
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Ajouter un document']);
    await userEvent.keyboard('{Escape}');

    // La feuille du ⋯ de l'en-tête, au téléphone : de même.
    await userEvent.click(screen.getByRole('button', { name: '⋯ de l’en-tête' }));
    const feuille = await screen.findByRole('dialog', { name: 'Plus d’actions' });
    expect(within(feuille).getByRole('button', { name: 'Modifier' })).toBeInTheDocument();
    expect(within(feuille).queryByRole('button', { name: /candidature ou une offre/ })).toBeNull();
  });

  it('7a — au téléphone, la feuille du ⋯ de l’en-tête porte les trois, et se ferme sur le geste', async () => {
    rendu();
    await userEvent.click(screen.getByRole('button', { name: '⋯ de l’en-tête' }));
    const feuille = await screen.findByRole('dialog', { name: 'Plus d’actions' });
    const libelles = within(feuille).getAllByRole('button').map((b) => b.textContent?.trim()).filter((l) => l && l !== 'Fermer');
    expect(libelles).toEqual(['Modifier', expect.stringMatching(/candidature ou une offre/), 'Ajouter un document']);

    await userEvent.click(within(feuille).getByRole('button', { name: 'Ajouter un document' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Plus d’actions' })).toBeNull());
    expect(screen.getByRole('button', { name: 'déposer le document' })).toBeInTheDocument();
  });

  it('6a / AC4 — un document ajouté relit la page et ouvre la ligne « Documents » du dossier', async () => {
    rendu();
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Ajouter un document' }));
    await userEvent.click(await screen.findByRole('button', { name: 'déposer le document' }));
    expect(nav.refresh).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('?section=documents', { scroll: false });
  });

  it('AC3 — toujours un seul contrôle d’étape, le dossier rendu', () => {
    rendu();
    expect(document.querySelector('[data-slot="dossier-du-client"]')).not.toBeNull();
    expect(screen.getAllByRole('combobox', { name: /^Étape de / })).toHaveLength(1);
  });
});
