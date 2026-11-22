import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Controller, type Control, type FieldValues } from 'react-hook-form';

import { withIntl } from '@/test/intl';

/**
 * TCK-2921 — le nouveau bail et l'aller-retour vers les réglages de l'agence :
 *
 * - AC2 : « Modifier » ouvre les réglages dans le MÊME onglet (aucun `target="_blank"`), APRÈS avoir
 *   écrit la saisie en brouillon (la dernière frappe est encore dans l'attente de 800 ms) ; l'adresse
 *   porte `?depuis=bail` et les identifiants du bail et du locataire ; un brouillon qui ne s'écrit
 *   pas retient la page ;
 * - AC2/AC3 : revenu à la même adresse (« Reprendre le bail »), la saisie revient (loyer 250 000), et
 *   les défauts relus portent la nouvelle valeur de l'agence.
 *
 * Doublures reprises de `CreateLeaseForm.brouillon-et-apercu.tck-2912` ; le réseau du brouillon est
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

const valeur = (libelle: RegExp | string) => (screen.getByLabelText(libelle) as HTMLInputElement).value;
const espaces = (texte: string) => texte.replace(/[\u00a0\u202f]/g, ' ');

type Appel = { readonly url: string; readonly methode: string; readonly corps: unknown };
const appels: Appel[] = [];
const ordre: string[] = [];
let brouillonServeur: Record<string, unknown> | null = null;
let ecritureEnEchec = false;
const CLE = 'lease-new.property-11.customer-7';
const VERS_LES_REGLAGES = '/app/agency/lease-settings?depuis=bail&property=11&customer=7&locataire=7';

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
      ordre.push('PUT');
      if (ecritureEnEchec) return new Response('{}', { status: 500 });
      const { step, data } = corps as { step: number; data: unknown };
      brouillonServeur = { id: 1, key: CLE, step, data, updated_at: '2026-11-15T10:42:00Z' };
      return new Response(JSON.stringify({ data: brouillonServeur }), { status: 200 });
    }
    brouillonServeur = null;
    return new Response(null, { status: 204 });
  }
  return new Response('{}', { status: 404 });
}

const ecritures = () => appels.filter((a) => a.url.includes('/api/me/wizard-drafts/') && a.methode === 'PUT');
const lienModifier = async () => {
  const encart = (await screen.findByText('Réglages de l’agence appliqués')).closest('div') as HTMLElement;
  return within(encart).getByRole('link', { name: /Modifier/ });
};

const DEFAUTS_11 = DEFAUTS.get(11)!.data as Record<string, unknown>;

beforeEach(() => {
  ROUTEUR.push.mockReset();
  ROUTEUR.push.mockImplementation(() => {
    ordre.push('push');
  });
  appels.length = 0;
  ordre.length = 0;
  brouillonServeur = null;
  ecritureEnEchec = false;
  ECRAN.bureau = true;
  DEFAUTS.set(11, { data: { ...DEFAUTS_11, can_edit_agency_settings: true } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => repondre(String(url), init)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TCK-2921 — « Modifier » les réglages, dans le même onglet, la saisie gardée', () => {
  it('AC2 — le lien reste dans l’onglet et porte le retour au bail', async () => {
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    const lien = await lienModifier();
    expect(lien).not.toHaveAttribute('target');
    expect(lien).toHaveAttribute('href', VERS_LES_REGLAGES);
    expect(lien).toHaveAccessibleName(/^Modifier ?les réglages de l’agence$/);
  });

  it('AC2 — la saisie part en brouillon AVANT la page, même tapée à l’instant', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('670 000'));
    await user.clear(screen.getByLabelText(/^Loyer/));
    await user.type(screen.getByLabelText(/^Loyer/), '250000');

    await user.click(await lienModifier());

    await waitFor(() => expect(ROUTEUR.push).toHaveBeenCalledWith(VERS_LES_REGLAGES));
    expect(ordre).toEqual(['PUT', 'push']);
    const { data } = ecritures().at(-1)!.corps as { data: { valeurs: Record<string, unknown> } };
    expect(data.valeurs.monthly_rent).toBe(250_000);
  });

  it('AC2 — un brouillon qui ne s’écrit pas retient la page, et le dit', async () => {
    const user = userEvent.setup();
    ecritureEnEchec = true;
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('670 000'));
    await user.clear(screen.getByLabelText(/^Loyer/));
    await user.type(screen.getByLabelText(/^Loyer/), '250000');

    await user.click(await lienModifier());

    expect(await screen.findByRole('alert')).toHaveTextContent('Votre saisie n’a pas pu être gardée en brouillon');
    expect(ROUTEUR.push).not.toHaveBeenCalled();
  });

  it('AC2/AC3 — « Reprendre le bail » (même adresse) : locataire et loyer saisis, défauts relus', async () => {
    const user = userEvent.setup();
    const { unmount } = render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('670 000'));
    await user.clear(screen.getByLabelText(/^Loyer/));
    await user.type(screen.getByLabelText(/^Loyer/), '250000');
    await user.click(await lienModifier());
    await waitFor(() => expect(ROUTEUR.push).toHaveBeenCalled());
    unmount();

    // Les réglages enregistrés : la pénalité de l'agence passe de 5 à 8 %.
    DEFAUTS.set(11, { data: { ...DEFAUTS_11, can_edit_agency_settings: true, late_fee_percent: { value: 8, source: 'agency' } } });
    // `lienDuBail({ propertyId: 11, customerId: 7 })` = `/app/leases/new?property=11&customer=7` : les mêmes props.
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));

    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('250 000'));
    expect(screen.getAllByText(/Ndèye Sokhna Thiam/).length).toBeGreaterThan(0);
    await waitFor(() => expect(valeur('Taux de la pénalité de retard, en pourcentage')).toBe('8'));
  });

  it('au téléphone, l’étape part avec la saisie et revient avec elle (Conditions)', async () => {
    ECRAN.bureau = false;
    const user = userEvent.setup();
    const { unmount } = render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('670 000'));
    await user.clear(screen.getByLabelText(/^Loyer/));
    await user.type(screen.getByLabelText(/^Loyer/), '250000');
    await user.click(await lienModifier());
    await waitFor(() => expect(ROUTEUR.push).toHaveBeenCalledWith(VERS_LES_REGLAGES));
    expect((ecritures().at(-1)!.corps as { step: number }).step).toBe(2);
    unmount();

    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('250 000'));
    const etapes = screen.getByRole('list', { name: 'Étapes de la création du bail' });
    expect(within(etapes).getByText('Conditions').closest('li')).toHaveAttribute('aria-current', 'step');
  });
});
