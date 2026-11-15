import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { OwnerProfileDetail } from '@/lib/queries/owners';
import { withIntl } from '@/test/intl';
import { FicheDuBailleur, type DroitsSurLaFiche, type FicheDuBailleurProps } from '../FicheDuBailleur';

/**
 * TCK-2910 — la fiche du bailleur porte son mandat entier (TCK-2909) : la pièce « Mandat de gestion
 * signé » et « Ajouter » (dépôt sur son profil), le versement et les dates (modifiables par PATCH, seules
 * les valeurs changées), l'adresse et le référent au bureau, le nombre d'encaissements, la nature, le
 * moyen et le « Reçu » de chaque reversement, et le « ⋯ » du téléphone.
 */
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/owners/5',
}));
const apiRequest = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/components/payments/CreatePayoutDialog', () => ({ CreatePayoutDialog: () => null }));
// Le sélecteur de date de l'application, en champ simple : seule la valeur ISO échangée compte ici.
vi.mock('@/components/forms/FormDatePicker', async () => {
  const { Controller } = await import('react-hook-form');
  return {
    FormDatePicker: ({ name, control, label }: { name: string; control: never; label: string }) => (
      <Controller name={name} control={control} render={({ field }) => <input aria-label={label} value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} />} />
    ),
  };
});
// Le « ⋯ » est rendu par la coque : ici, ses actions dans une feuille ouverte.
vi.mock('@/components/layout/en-tete-de-la-coque', async () => {
  const { Sheet } = await import('@/components/ui/sheet');
  return {
    DeclarerEnTete: ({ actions }: { actions?: ReactNode }) =>
      actions ? (
        <Sheet open>
          <div data-testid="plus-d-actions">{actions}</div>
        </Sheet>
      ) : null,
  };
});
const AJOUT = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@/components/documents/coffre/ajout/AjoutAuCoffre', () => ({
  AjoutAuCoffre: (props: Record<string, unknown>) => {
    AJOUT.props = props;
    return props.open ? <p>ajout au coffre</p> : null;
  },
}));
const remettre = vi.fn();
vi.mock('@/lib/owners/releve', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/owners/releve')>()),
  remettreLeReleve: (...args: unknown[]) => remettre(...args),
}));

const vide = { data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 }, links: {} };

function owner(surcharges: Partial<OwnerProfileDetail> = {}): OwnerProfileDetail {
  return {
    id: 5, user_id: 9, agency_id: 7, status: 'active', joined_at: '2025-03-12T00:00:00Z',
    owner_type: 'individual', company_name: null,
    contact: { first_name: 'Mouhamed', last_name: 'Sène', full_name: 'Mouhamed Sène', email: 'm.sene@example.test', phone: '+221703757526', address: 'Sicap Liberté 3, Dakar' },
    pending_invitation_id: null, properties_count: 7, occupied_properties_count: 6,
    figures: { period: '2026-11', currency: 'XOF', collected: 11437597, commission: 850457, fees: 0, net: 0, paid_out: 7469771, collections_count: 9, remaining_to_pay: 3117369, from_snapshot: false },
    balance: { remaining_to_pay: 3117369, as_of: '2026-11-12' },
    last_payout: null, next_payout: null, works_approval_threshold: 150000, agency_commission_rate: 7.5, lease_commission_rates: [],
    mandate: {
      starts_on: '2025-03-12', ends_on: '2028-03-11', payout_method: 'bank_transfer', payout_day: 10,
      referent: { id: 31, first_name: 'Awa', last_name: 'Diop', is_active: true },
    },
    mandate_document: { id: 812, name: 'Mandat Sène 2025', created_at: '2025-03-12T09:00:00Z', file_size: 250_880, mime_type: 'application/pdf', download_path: '/api/documents/812' },
    rib_masked: null, tax_id_masked: null, id_document_number_masked: null,
    ...surcharges,
  };
}

const tous: DroitsSurLaFiche = { plafond: true, reversement: true, suspension: true, sensible: true };

function monter(props: Partial<FicheDuBailleurProps> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={client}>
      <FicheDuBailleur owner={owner()} period="2026-11" moisCourant="2026-11" biens={[]} agencyId={7} droits={tous} {...props} />
    </QueryClientProvider>,
  ));
}

const carte = (id: string) => within(document.querySelector(`[aria-labelledby="${id}"]`) as HTMLElement);

beforeEach(() => {
  refresh.mockReset();
  toastAdd.mockReset();
  remettre.mockReset();
  AJOUT.props = null;
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => vide);
});

describe('TCK-2910 — les documents du mandat', () => {
  it('AC1 — « Mandat de gestion signé », sa date et son fichier, mène à la fiche du document, une seule fois', async () => {
    // La liste du coffre rend aussi la pièce : elle n'est pas répétée.
    apiRequest.mockImplementation(async (chemin: string) => (chemin.startsWith('/api/documents')
      ? { ...vide, data: [{ id: 812, name: 'Mandat Sène 2025', type: 'management_mandate', created_at: '2025-03-12T09:00:00Z', file_url: null }, { id: 813, name: 'Assurance', type: 'insurance', created_at: '2025-04-01T09:00:00Z', file_url: null }] }
      : vide));
    monter();
    const docs = carte('fiche-documents');
    const lien = docs.getByRole('link', { name: 'Mandat de gestion signé' });
    expect(lien).toHaveAttribute('href', '/app/documents/812');
    expect(document.querySelector('[data-slot="mandat-signe"]')).toHaveTextContent('12 mars 2025 · PDF, 245 Ko');
    await docs.findByText('Assurance');
    expect(docs.queryByText('Mandat Sène 2025')).not.toBeInTheDocument();
  });

  it('sans pièce « mandat », pas de ligne du mandat', () => {
    monter({ owner: owner({ mandate_document: null }) });
    expect(screen.queryByText('Mandat de gestion signé')).not.toBeInTheDocument();
  });

  it('AC2 — « Ajouter » ouvre l’ajout sur le profil du bailleur ; après le dépôt, la fiche se relit', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(carte('fiche-documents').getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('ajout au coffre')).toBeInTheDocument();
    expect(AJOUT.props?.impose).toMatchObject({ type: 'owner_profile', id: 5, nom: 'Mouhamed Sène', categorie: 'management_mandate' });
    expect(AJOUT.props?.impose).not.toMatchObject({ categories: expect.arrayContaining(['id_card']) });
    (AJOUT.props?.onAjoute as () => void)();
    expect(refresh).toHaveBeenCalled();
  });
});

describe('TCK-2910 — les réglages du mandat', () => {
  it('AC3 — « Versement — Virement, avant le 10 du mois » et « 12 mars 2025 → 11 mars 2028 »', () => {
    monter();
    expect(document.querySelector('[data-slot="versement-du-mandat"]')).toHaveTextContent('VersementVirement, avant le 10 du mois');
    expect(document.querySelector('[data-slot="dates-du-mandat"]')).toHaveTextContent('Mandat12 mars 2025 → 11 mars 2028');
  });

  it('sans dates : « Dates du mandat à renseigner » à qui peut modifier, rien aux autres ; sans moyen ni jour, pas de ligne', () => {
    const sansTermes = owner({ mandate: { starts_on: null, ends_on: null, payout_method: null, payout_day: null, referent: null } });
    const { unmount } = monter({ owner: sansTermes });
    expect(document.querySelector('[data-slot="dates-du-mandat"]')).toHaveTextContent('Dates du mandat à renseigner');
    expect(document.querySelector('[data-slot="versement-du-mandat"]')).toBeNull();
    unmount();
    monter({ owner: sansTermes, droits: { ...tous, plafond: false } });
    expect(document.querySelector('[data-slot="dates-du-mandat"]')).toBeNull();
    expect(screen.queryByText('Dates du mandat à renseigner')).not.toBeInTheDocument();
  });

  it('AC3 — modifier envoie PATCH /api/owners/5 avec les seuls champs du mandat changés', async () => {
    apiRequest.mockImplementation(async (chemin: string, options?: { method?: string }) => (options?.method === 'PATCH' ? { data: {} } : vide));
    const user = userEvent.setup();
    monter({ owner: owner({ mandate: { starts_on: null, ends_on: null, payout_method: 'bank_transfer', payout_day: 5, referent: null } }) });
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const jour = screen.getByRole('spinbutton', { name: 'Versé avant le (jour du mois)' });
    await user.clear(jour);
    await user.type(jour, '10');
    fireEvent.change(screen.getByLabelText('Début du mandat'), { target: { value: '2025-03-12' } });
    fireEvent.change(screen.getByLabelText('Fin du mandat'), { target: { value: '2028-03-11' } });
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/owners/5', expect.objectContaining({ method: 'PATCH' })));
    const corps = apiRequest.mock.calls.find(([, o]) => o?.method === 'PATCH')?.[1]?.body;
    expect(corps).toEqual({ payout_day: 10, mandate_starts_on: '2025-03-12', mandate_ends_on: '2028-03-11' });
    expect(refresh).toHaveBeenCalled();
  });

  it('une saisie annulée ne revient pas à l’ouverture suivante par le « ⋯ »', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const jour = screen.getByRole('spinbutton', { name: 'Versé avant le (jour du mois)' });
    await user.clear(jour);
    await user.type(jour, '20');
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(within(screen.getByTestId('plus-d-actions')).getByRole('button', { name: 'Modifier le mandat' }));
    expect(screen.getByRole('spinbutton', { name: 'Versé avant le (jour du mois)' })).toHaveValue(10);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument());
    expect(apiRequest.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(false);
  });

  it('rien de changé : rien ne part (un corps vide serait un 422)', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument());
    expect(apiRequest.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(false);
  });

  it('un jour hors de 1 à 28 ne part pas', async () => {
    const user = userEvent.setup();
    monter();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const jour = screen.getByRole('spinbutton', { name: 'Versé avant le (jour du mois)' });
    await user.clear(jour);
    await user.type(jour, '31');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Choisissez un jour entre 1 et 28.')).toBeInTheDocument();
    expect(apiRequest.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(false);
  });
});

describe('TCK-2910 — identité, encaissements, reversements, « ⋯ »', () => {
  it('AC4 — le bloc d’identité rend l’adresse et « suivi par Awa Diop » ; un référent parti est signalé', () => {
    const { unmount } = monter();
    expect(document.querySelector('[data-slot="adresse-du-bailleur"]')).toHaveTextContent('Sicap Liberté 3, Dakar');
    expect(document.querySelector('[data-slot="nature-et-referent"]')).toHaveTextContent('Particulier · suivi par Awa Diop');
    unmount();
    monter({ owner: owner({ contact: { ...owner().contact, address: null }, mandate: { ...owner().mandate!, referent: { id: 31, first_name: 'Awa', last_name: 'Diop', is_active: false } } }) });
    expect(document.querySelector('[data-slot="adresse-du-bailleur"]')).toBeNull();
    expect(document.querySelector('[data-slot="nature-et-referent"]')).toHaveTextContent('suivi par Awa Diop (plus dans l’agence)');
  });

  it('AC5 — « 9 encaissements » sous « Encaissé », au singulier pour 1', () => {
    const { unmount } = monter();
    expect(within(document.querySelector('[data-slot="mouvements-du-mois-bureau"]') as HTMLElement).getByText('9 encaissements')).toBeInTheDocument();
    unmount();
    monter({ owner: owner({ figures: { ...owner().figures!, collections_count: 1 } }) });
    expect(screen.getByText('1 encaissement')).toBeInTheDocument();
  });

  it('« Déjà versé » dit le jour et le moyen du dernier versement : « le 5 nov., par virement »', () => {
    monter({ owner: owner({ last_payout: { id: 3, processed_at: '2026-11-05T10:00:00Z', net_amount: 7469771, payment_method: 'bank_transfer' } }) });
    expect(within(document.querySelector('[data-slot="mouvements-du-mois-bureau"]') as HTMLElement).getByText('le 5 nov., par virement')).toBeInTheDocument();
  });

  it('AC6 — chaque reversement rend sa nature et son moyen ; « Reçu » remet GET /api/payouts/{id}/notice/pdf', async () => {
    apiRequest.mockImplementation(async (chemin: string) => (chemin.startsWith('/api/payouts')
      ? {
          ...vide,
          data: [
            { id: 3, reference_number: 'PO-3', status: 'completed', payee_role: 'landlord', nature: 'advance', payment_method: 'bank_transfer', period_start: '2026-11-01', processed_at: '2026-11-05T10:00:00Z', scheduled_at: null, created_at: '2026-11-05T10:00:00Z', net_amount: 7469771, currency: 'XOF' },
            { id: 2, reference_number: 'PO-2', status: 'completed', payee_role: 'landlord', nature: 'balance', payment_method: 'wave', period_start: '2026-10-01', processed_at: '2026-10-15T10:00:00Z', scheduled_at: null, created_at: '2026-10-15T10:00:00Z', net_amount: 2846300, currency: 'XOF' },
            { id: 1, reference_number: 'PO-1', status: 'pending', payee_role: 'landlord', nature: null, payment_method: null, period_start: '2026-09-01', processed_at: null, scheduled_at: null, created_at: '2026-10-06T10:00:00Z', net_amount: 3612500, currency: 'XOF' },
          ],
        }
      : vide));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Blob(['%PDF'], { type: 'application/pdf' }), { status: 200 }));
    const user = userEvent.setup();
    monter();
    await screen.findByText('Acompte de novembre');
    const liste = within(document.querySelector('[data-slot="derniers-reversements"]') as HTMLElement);
    expect(liste.getByText('Solde d’octobre')).toBeInTheDocument();
    expect(liste.getByText('Reversement de septembre')).toBeInTheDocument();
    expect(liste.getAllByText('Virement').length).toBeGreaterThan(0);
    expect(liste.getAllByText('Wave').length).toBeGreaterThan(0);
    // Le reversement en attente n'a pas de reçu (l'API le refuserait) : il dit son statut.
    expect(liste.getAllByRole('button', { name: /^Reçu du reversement du/ })).toHaveLength(2);
    expect(liste.getByText('En attente')).toBeInTheDocument();
    await user.click(liste.getAllByRole('button', { name: /^Reçu du reversement du/ })[0] as HTMLElement);
    await waitFor(() => expect(remettre).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/api\/payouts\/3\/notice\/pdf$/);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer jeton', Accept: 'application/pdf' });
    expect(remettre.mock.calls[0]?.[1]).toBe('avis-de-versement-PO-3.pdf');
    fetchMock.mockRestore();
  });

  it('AC7 — le « ⋯ » du téléphone porte « Modifier le mandat » (qui ouvre l’édition) et « Accès et départ »', async () => {
    Element.prototype.scrollIntoView = vi.fn();
    const user = userEvent.setup();
    const { unmount } = monter();
    const menu = within(screen.getByTestId('plus-d-actions'));
    expect(menu.getByRole('button', { name: 'Accès et départ' })).toBeInTheDocument();
    await user.click(menu.getByRole('button', { name: 'Modifier le mandat' }));
    expect(screen.getByRole('spinbutton', { name: 'Versé avant le (jour du mois)' })).toBeInTheDocument();
    unmount();
    // Sans owners.update ni section d'accès : pas de « ⋯ ».
    monter({ droits: { plafond: false, reversement: true, suspension: false, depart: false, sensible: true } });
    expect(screen.queryByTestId('plus-d-actions')).toBeNull();
  });
});
