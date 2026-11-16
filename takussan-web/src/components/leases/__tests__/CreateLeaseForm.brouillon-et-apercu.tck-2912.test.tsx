import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Controller, type Control, type FieldValues } from 'react-hook-form';

import { withIntl } from '@/test/intl';

/**
 * TCK-2912 — la création d'un bail (maquette `app-baux` a, « Création — étape 3 ») :
 *
 * - AC6 : la saisie s'enregistre en brouillon (`PUT /api/me/wizard-drafts/{key}`, champs SAISIS seuls),
 *   revient au retour sur la page, et s'efface à la création du bail ; le bureau dit « brouillon
 *   enregistré à 10:42 » ;
 * - AC7 : au bureau, « Aperçu du contrat » rappelle `POST /api/leases/contract-preview` au plus une fois
 *   par seconde de saisie, avec les conditions saisies ;
 * - AC8 : le champ « Préavis » (prérempli, 1 à 365 jours) part en `notice_period_days`.
 *
 * Mêmes doublures que `CreateLeaseForm.creation.tck-2643` ; le réseau du brouillon et de l'aperçu est
 * un `fetch` simulé.
 */
const { BIENS, CLIENTS, AUTH, ROUTEUR, CREATION, SIGNATURE, DEFAUTS, LOCATAIRES, RESERVATION, CREER_CLIENT } = vi.hoisted(() => {
  const defauts = (surcharge: Record<string, unknown> = {}) => ({
    property_id: 11,
    type: 'residential_rent',
    currency: 'XOF',
    property_price: { amount: 670_000, period: 'monthly', contract_type: 'rent' },
    monthly_rent: { value: 670_000, source: 'property' },
    sale_price: null,
    monthly_charges: { value: 25_000, source: 'property' },
    deposit_months: { value: 2, source: 'property' },
    deposit_amount: { value: 1_340_000, source: 'property' },
    advance_months: { value: 1, source: 'property' },
    agency_fee_months: null,
    entry_cost: { total: 2_035_000 },
    payment_day: { value: 1, source: 'platform' },
    late_fee_percent: { value: 5, source: 'agency' },
    late_fee_grace_days: { value: 5, source: 'agency' },
    early_termination_penalty_months: { value: 3, source: 'platform' },
    rent_review_max_pct: { value: 10, source: 'platform' },
    open_applications: [
      { id: 90, customer_id: 7 },
      { id: 91, customer_id: 8 },
    ],
    agency_commission_rate: { value: 8, source: 'agency' },
    // TCK-2912 — le préavis prérempli (TCK-2906 : la plateforme).
    notice_period_days: { value: 90, source: 'platform' },
    ...surcharge,
  });
  return {
    BIENS: {
      data: [
        { id: 11, title: 'Appartement F3', reference_number: 'TK-52086', price: 670_000, currency: 'XOF', user_id: 3, owner: { id: 3, name: 'Khady Faye' } },
        { id: 12, title: 'Villa à vendre', reference_number: 'TK-90001', price: 45_000_000, currency: 'XOF', user_id: 3, owner: { id: 3, name: 'Khady Faye' } },
      ],
    },
    CLIENTS: { data: [] },
    CREER_CLIENT: vi.fn(async (_corps: Record<string, unknown>): Promise<Record<string, unknown>> => ({ ok: true })),
    AUTH: { user: { id: 4, full_name: 'Moussa Fall' } },
    ROUTEUR: { push: vi.fn(), back: () => {} },
    CREATION: { mutateAsync: vi.fn(async (_valeurs: unknown) => ({ data: { id: 1 } })) },
    SIGNATURE: { mutateAsync: vi.fn(async (_v: { leaseId: number }) => ({ data: {} })) },
    // Des références STABLES par bien, comme les données de React Query : le préremplissage suit
    // l'identité des défauts.
    DEFAUTS: new Map<number, { data: unknown }>([
      [11, { data: defauts() }],
      [
        12,
        {
          data: defauts({
            property_id: 12,
            type: 'sale',
            property_price: { amount: 45_000_000, period: null, contract_type: 'sale' },
            monthly_rent: null,
            sale_price: { value: 45_000_000, source: 'property' },
            monthly_charges: null,
            deposit_months: null,
            deposit_amount: null,
            advance_months: null,
            entry_cost: null,
            open_applications: [],
          }),
        },
      ],
      [2, { data: defauts({ property_id: 2 }) }],
    ]),
    LOCATAIRES: new Map<number, { data: unknown }>([
      [7, { data: { id: 7, first_name: 'Ndèye Sokhna', last_name: 'Thiam', email: null, phone: '+221765182207', user_id: 70 } }],
      [8, { data: { id: 8, first_name: 'Awa', last_name: 'Diop', email: null, phone: null, user_id: null } }],
    ]),
    RESERVATION: {
      data: {
        data: {
          id: 7,
          property_id: 2,
          customer_id: 21,
          status: 'confirmed',
          reference_number: 'BK-7',
          start_date: '2099-01-01T00:00:00.000000Z',
          end_date: '2099-12-31T00:00:00.000000Z',
          property: { id: 2, title: 'Villa Almadies', slug: 'villa', price: 250_000, currency: 'XOF', contract_type: 'rent' },
          customer: { id: 21, user_id: null, first_name: 'Awa', last_name: 'Diop' },
        },
      },
      isLoading: false,
      isError: false,
    },
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
// TCK-2912 — la largeur : l'aperçu n'est demandé qu'au bureau.
const ECRAN = vi.hoisted(() => ({ bureau: false }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ECRAN.bureau, useMatchesMaxWidth: () => false }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/lib/queries/leases', () => ({
  useCreateLease: () => CREATION,
  useDemanderLaSignature: () => SIGNATURE,
  useLeasePropertyOptions: () => ({ data: BIENS, isLoading: false }),
  useLeaseCustomerOptions: () => ({ data: CLIENTS, isLoading: false }),
  useLeaseDefaults: (id: number | null | undefined) => ({ data: id ? DEFAUTS.get(id) : undefined }),
  useLeaseCustomer: (id: number | null | undefined) => ({ data: id ? LOCATAIRES.get(id) : undefined }),
}));
vi.mock('@/lib/queries/bookings', () => ({ useBooking: () => RESERVATION }));
vi.mock('@/app/actions/dashboard-customers', () => ({ createCustomerAction: (corps: Record<string, unknown>) => CREER_CLIENT(corps) }));
vi.mock('@/components/forms/FormDatePicker', () => ({
  FormDatePicker: ({ control, name, label }: { control: Control<FieldValues>; name: string; label: string }) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label>
          {label}
          <input value={field.value ?? ''} onChange={(e) => field.onChange(e.target.value)} />
        </label>
      )}
    />
  ),
}));

import { CreateLeaseForm } from '../CreateLeaseForm';
import { MentionDuBrouillon, SuiviDuBrouillon } from '../creation/BrouillonDuBail';

const valeur = (libelle: RegExp | string) => (screen.getByLabelText(libelle) as HTMLInputElement).value;
const espaces = (texte: string) => texte.replace(/[  ]/g, ' ');

// TCK-2912 — le réseau du brouillon (`/api/me/wizard-drafts/{key}`) et de l'aperçu (`POST …/contract-preview`).
type Appel = { readonly url: string; readonly methode: string; readonly corps: unknown };
const appels: Appel[] = [];
let brouillonServeur: Record<string, unknown> | null = null;
const CLE = 'lease-new.property-11.customer-7';

function repondre(url: string, init: RequestInit = {}) {
  const methode = init.method ?? 'GET';
  const corps = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
  appels.push({ url, methode, corps });
  if (url.includes('/api/me/wizard-drafts/')) {
    if (methode === 'GET') {
      return brouillonServeur
        ? new Response(JSON.stringify({ data: brouillonServeur }), { status: 200 })
        : new Response('{}', { status: 404 });
    }
    if (methode === 'PUT') {
      const { step, data } = corps as { step: number; data: unknown };
      brouillonServeur = { id: 1, key: CLE, step, data, updated_at: '2026-11-15T10:42:00Z' };
      return new Response(JSON.stringify({ data: brouillonServeur }), { status: 200 });
    }
    brouillonServeur = null;
    return new Response(null, { status: 204 });
  }
  if (url.endsWith('/api/leases/contract-preview')) return new Response(new Blob(['%PDF-1.7']), { status: 200 });
  return new Response('{}', { status: 404 });
}

const apercus = () => appels.filter((a) => a.url.endsWith('/api/leases/contract-preview'));
const ecritures = () => appels.filter((a) => a.url.includes('/api/me/wizard-drafts/') && a.methode === 'PUT');

beforeEach(() => {
  CREATION.mutateAsync.mockClear();
  ROUTEUR.push.mockClear();
  appels.length = 0;
  brouillonServeur = null;
  ECRAN.bureau = false;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => repondre(String(url), init)));
  let n = 0;
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => `blob:apercu-${++n}`, revokeObjectURL: () => {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AC6 — le brouillon enregistré', () => {
  it('une saisie s’enregistre (champs saisis seuls), et l’en-tête du bureau en dit l’heure', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <SuiviDuBrouillon>
          <p data-testid="sous-titre">
            <MentionDuBrouillon texte="Prérempli depuis la fiche du bien" />
          </p>
          <CreateLeaseForm propertyId={11} customerId={7} />
        </SuiviDuBrouillon>,
      ),
    );
    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('670 000'));
    await user.clear(screen.getByLabelText(/^Loyer/));
    await user.type(screen.getByLabelText(/^Loyer/), '700000');

    await waitFor(() => expect(ecritures().length).toBeGreaterThan(0), { timeout: 3000 });
    const derniere = ecritures().at(-1)!;
    expect(derniere.url).toBe(`/api/me/wizard-drafts/${CLE}`);
    const { data } = derniere.corps as { data: { valeurs: Record<string, unknown> } };
    expect(data.valeurs.monthly_rent).toBe(700_000);
    // Un préremplissage n'est pas une saisie : les charges du bien ne s'enregistrent pas.
    expect(data.valeurs).not.toHaveProperty('monthly_charges');
    await waitFor(() => expect(screen.getByTestId('sous-titre')).toHaveTextContent('Prérempli depuis la fiche du bien · brouillon enregistré à 10:42'));
  });

  it('un formulaire seulement prérempli n’écrit aucun brouillon', async () => {
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('670 000'));
    await new Promise((r) => setTimeout(r, 1200));
    expect(ecritures()).toHaveLength(0);
  });

  it('au retour sur la page, la saisie revient — le préremplissage du bien ne la réécrit pas', async () => {
    brouillonServeur = { id: 1, key: CLE, step: 2, data: { valeurs: { monthly_rent: 720_000, notice_period_days: 60 } }, updated_at: '2026-11-15T10:42:00Z' };
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('720 000'));
    // Les défauts du bien arrivent et remplissent ce qui n'a pas été saisi.
    await waitFor(() => expect(espaces(valeur(/^Charges/))).toBe('25 000'));
    expect(espaces(valeur(/^Loyer/))).toBe('720 000');
    expect(valeur(/^Préavis/)).toBe('60');
    // Relu tel quel : rien ne se réécrit à l'ouverture.
    await new Promise((r) => setTimeout(r, 1000));
    expect(ecritures()).toHaveLength(0);
  });

  it('sans bien dans l’adresse, le brouillon rend aussi le bien choisi ; les défauts qui arrivent ensuite ne réécrivent pas la saisie', async () => {
    brouillonServeur = { id: 1, key: 'lease-new', step: 2, data: { valeurs: { property_id: 11, monthly_rent: 720_000 } }, updated_at: '2026-11-15T10:42:00Z' };
    render(withIntl(<CreateLeaseForm />));
    // Le bien repris lit ses défauts APRÈS la reprise : seuls les champs non saisis les prennent.
    await waitFor(() => expect(espaces(valeur(/^Charges/))).toBe('25 000'));
    expect(espaces(valeur(/^Loyer/))).toBe('720 000');
    expect(appels.some((a) => a.methode === 'GET' && a.url === '/api/me/wizard-drafts/lease-new')).toBe(true);
  });

  it('créer le bail efface le brouillon', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));
    await user.type(screen.getByLabelText('Début'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Créer le brouillon' }));

    await waitFor(() => expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(appels.some((a) => a.methode === 'DELETE' && a.url === `/api/me/wizard-drafts/${CLE}`)).toBe(true));
  });
});

describe('AC7 — l’aperçu du contrat, au bureau', () => {
  it('la colonne de droite rend « Aperçu du contrat » ; changer le loyer le redemande, une fois après la saisie', async () => {
    ECRAN.bureau = true;
    // 50 ms entre deux frappes : une demande par frappe se verrait (le délai de saisie est d'une seconde).
    const user = userEvent.setup({ delay: 50 });
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    const carte = await screen.findByTestId('apercu-du-contrat');
    expect(within(carte).getByRole('heading', { name: 'Aperçu du contrat' })).toBeInTheDocument();
    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));
    // Sans début, le bail ne passe pas le schéma : rien n'est demandé.
    expect(apercus()).toHaveLength(0);

    await user.type(screen.getByLabelText('Début'), '2026-12-01');
    await waitFor(() => expect(apercus()).toHaveLength(1), { timeout: 3000 });
    expect(apercus()[0]!.corps).toMatchObject({ property_id: 11, tenant_id: 7, monthly_rent: 670_000, start_date: '2026-12-01' });
    await waitFor(() => expect(within(carte).getByTitle('Aperçu du contrat de bail')).toHaveAttribute('src', expect.stringMatching(/^blob:apercu-1#/)));

    await user.clear(screen.getByLabelText(/^Loyer/));
    await user.type(screen.getByLabelText(/^Loyer/), '700000');
    await waitFor(() => expect(apercus()).toHaveLength(2), { timeout: 3000 });
    // Six frappes, un seul appel : celui du loyer final.
    expect(apercus()[1]!.corps).toMatchObject({ monthly_rent: 700_000 });
    await new Promise((r) => setTimeout(r, 1200));
    expect(apercus()).toHaveLength(2);
    await waitFor(() => expect(within(carte).getByTitle('Aperçu du contrat de bail')).toHaveAttribute('src', expect.stringMatching(/^blob:apercu-2#/)));
  });

  it('au téléphone, aucun aperçu n’est demandé', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));
    await user.type(screen.getByLabelText('Début'), '2026-12-01');
    await new Promise((r) => setTimeout(r, 1300));
    expect(apercus()).toHaveLength(0);
  });
});

describe('AC8 — le préavis', () => {
  it('prérempli (90 jours = « 3 mois »), modifiable, envoyé en `notice_period_days`', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(valeur(/^Préavis/)).toBe('90'));
    const champ = screen.getByLabelText(/^Préavis/).closest<HTMLElement>('[data-testid="champ-preavis"]')!;
    expect(within(champ).getByText('Réglage de la plateforme')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/^Préavis/));
    await user.type(screen.getByLabelText(/^Préavis/), '60');
    expect(within(champ).getByText('2 mois')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Début'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Créer le brouillon' }));

    await waitFor(() => expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1));
    expect(CREATION.mutateAsync.mock.calls[0]![0]).toMatchObject({ notice_period_days: 60 });
  });
});
