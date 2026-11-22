import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Controller, type Control, type FieldValues } from 'react-hook-form';

import { withIntl } from '@/test/intl';

/**
 * TCK-2643 — ce que la vérification adverse des lots 1-3 a trouvé (`verif-2643`, r1 à r4).
 *
 * - r1 : changer de bien remet le loyer, la caution, les charges et le prix de vente à ceux du
 *   NOUVEAU bien — vides s'il n'en a pas. Le POST partait avec la caution et les charges du premier ;
 * - r2 : tant que l'agent n'a pas saisi la caution, elle suit le loyer (mois × loyer) ; saisie, elle
 *   ne bouge plus ;
 * - r3 : deux clics dans la même tâche n'envoient qu'un bail ;
 * - r4 : un `?customer=` que l'API ne rend pas ne fait sauter aucune étape, et ne choisit personne.
 *
 * Le bien 13 n'a ni caution ni charges ; le sélecteur de date est un champ texte (comme dans
 * `CreateLeaseForm.creation.tck-2643.test.tsx`).
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
    ...surcharge,
  });
  return {
    BIENS: {
      data: [
        { id: 11, title: 'Appartement F3', reference_number: 'TK-52086', price: 670_000, currency: 'XOF', user_id: 3, owner: { id: 3, name: 'Khady Faye' } },
        { id: 13, title: 'Studio sans caution', reference_number: 'TK-13', price: 300_000, currency: 'XOF', user_id: 3, owner: { id: 3, name: 'Khady Faye' } },
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
      [
        13,
        {
          data: defauts({
            property_id: 13,
            property_price: { amount: 300_000, period: 'monthly', contract_type: 'rent' },
            monthly_rent: { value: 300_000, source: 'property' },
            monthly_charges: null,
            deposit_months: null,
            deposit_amount: null,
            advance_months: null,
            entry_cost: null,
            late_fee_percent: { value: 0, source: 'platform' },
            late_fee_grace_days: { value: 0, source: 'platform' },
            open_applications: [],
          }),
        },
      ],
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
const espaces = (texte: string) => texte.replace(/[  ]/g, ' ');

beforeEach(() => {
  CREATION.mutateAsync.mockReset();
  CREATION.mutateAsync.mockImplementation(async () => ({ data: { id: 1 } }));
  SIGNATURE.mutateAsync.mockReset();
  SIGNATURE.mutateAsync.mockImplementation(async () => ({ data: {} }));
  ROUTEUR.push.mockClear();
});

/** Une requête qui ne répond qu'à la demande : le réseau lent d'un téléphone. */
function enAttente() {
  let liberer: (v: { data: { id: number } }) => void = () => {};
  const p = new Promise<{ data: { id: number } }>((r) => {
    liberer = r;
  });
  return { p, liberer: () => liberer({ data: { id: 1 } }) };
}

const etapeCourante = () =>
  within(screen.getByRole('list', { name: 'Étapes de la création du bail' }))
    .getAllByRole('listitem')
    .find((li) => li.getAttribute('aria-current') === 'step')?.textContent;

async function choisirLeBien(user: ReturnType<typeof userEvent.setup>, nom: RegExp) {
  await user.click(screen.getByRole('combobox', { name: /^Bien/ }));
  await user.click(await screen.findByRole('option', { name: nom }));
}

describe('CreateLeaseForm — changer de bien (TCK-2643, r1)', () => {
  it('le bien sans caution ni charges envoie son loyer, une caution à 0 et aucune charge', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm customerId={7} />));
    await choisirLeBien(user, /Appartement F3/);
    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));
    expect(espaces(valeur(/^Charges/))).toBe('25 000');

    await user.click(screen.getByRole('button', { name: 'Changer le bien' }));
    await choisirLeBien(user, /Studio sans caution/);
    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('300 000'));
    expect(espaces(valeur(/^Caution/))).toBe('0');
    expect(valeur(/^Charges/)).toBe('');

    await user.type(screen.getByLabelText('Début'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Créer le brouillon' }));
    await waitFor(() => expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1));
    const corps = CREATION.mutateAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(corps).toMatchObject({ property_id: 13, monthly_rent: 300_000, deposit_amount: 0 });
    expect(corps.monthly_charges).toBeUndefined();
  });

  it('une caution et un loyer saisis pour le premier bien ne survivent pas au changement', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm customerId={7} />));
    await choisirLeBien(user, /Appartement F3/);
    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));
    await user.clear(screen.getByLabelText(/^Caution/));
    await user.type(screen.getByLabelText(/^Caution/), '999000');
    await user.clear(screen.getByLabelText(/^Charges/));
    await user.type(screen.getByLabelText(/^Charges/), '40000');
    await user.clear(screen.getByLabelText(/^Loyer/));
    await user.type(screen.getByLabelText(/^Loyer/), '650000');

    await user.click(screen.getByRole('button', { name: 'Changer le bien' }));
    await choisirLeBien(user, /Studio sans caution/);

    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('300 000'));
    expect(espaces(valeur(/^Caution/))).toBe('0');
    expect(valeur(/^Charges/)).toBe('');
  });

  it('tant que les défauts du nouveau bien n’arrivent pas, le formulaire ne porte plus les montants de l’ancien', async () => {
    const defautsDu13 = DEFAUTS.get(13)!;
    DEFAUTS.delete(13);
    try {
      const user = userEvent.setup();
      render(withIntl(<CreateLeaseForm customerId={7} />));
      await choisirLeBien(user, /Appartement F3/);
      await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));

      await user.click(screen.getByRole('button', { name: 'Changer le bien' }));
      await choisirLeBien(user, /Studio sans caution/);

      expect(espaces(valeur(/^Caution/))).toBe('0');
      expect(valeur(/^Charges/)).toBe('');
      expect(valeur(/^Loyer/)).toBe('0');
      await user.type(screen.getByLabelText('Début'), '2026-12-01');
      await user.click(screen.getByRole('button', { name: 'Créer le brouillon' }));
      await new Promise((res) => setTimeout(res, 100));
      // Sans loyer, rien ne part — et surtout pas la caution du bien d'avant.
      expect(CREATION.mutateAsync).not.toHaveBeenCalled();
    } finally {
      DEFAUTS.set(13, defautsDu13);
    }
  });

  it('revenir au bien à caution reprend ses montants', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm customerId={7} />));
    await choisirLeBien(user, /Studio sans caution/);
    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('300 000'));

    await user.click(screen.getByRole('button', { name: 'Changer le bien' }));
    await choisirLeBien(user, /Appartement F3/);

    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));
    expect(espaces(valeur(/^Loyer/))).toBe('670 000');
    expect(espaces(valeur(/^Charges/))).toBe('25 000');
  });
});

describe('CreateLeaseForm — la caution suit le loyer (TCK-2643, r2)', () => {
  it('préremplie à 2 mois, elle devient 2 × le loyer saisi, et le pas-à-pas dit toujours « 2 mois »', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(screen.getByText('2 mois')).toBeInTheDocument());

    await user.clear(screen.getByLabelText(/^Loyer/));
    await user.type(screen.getByLabelText(/^Loyer/), '700000');

    expect(espaces(valeur(/^Caution/))).toBe('1 400 000');
    expect(screen.getByText('2 mois')).toBeInTheDocument();
  });

  it('un loyer saisi avant le choix du bien : la caution vaut les mois du bien × CE loyer', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm customerId={7} />));
    await user.type(screen.getByLabelText(/^Loyer/), '500000');
    await choisirLeBien(user, /Appartement F3/);

    await waitFor(() => expect(espaces(valeur(/^Charges/))).toBe('25 000'));
    expect(espaces(valeur(/^Loyer/))).toBe('500 000');
    expect(espaces(valeur(/^Caution/))).toBe('1 000 000');
    expect(screen.getByText('2 mois')).toBeInTheDocument();
  });

  it('depuis une réservation : les mois du bien × le loyer de la réservation', async () => {
    render(withIntl(<CreateLeaseForm bookingId={7} />));

    await waitFor(() => expect(valeur('Taux de la pénalité de retard, en pourcentage')).toBe('5'));
    expect(espaces(valeur(/^Loyer/))).toBe('250 000');
    expect(espaces(valeur(/^Caution/))).toBe('500 000');
  });

  it('réglée au pas-à-pas à 3 mois, elle suit le loyer à 3 mois', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(screen.getByText('2 mois')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Un mois de plus' }));

    await user.clear(screen.getByLabelText(/^Loyer/));
    await user.type(screen.getByLabelText(/^Loyer/), '500000');

    expect(espaces(valeur(/^Caution/))).toBe('1 500 000');
    expect(screen.getByText('3 mois')).toBeInTheDocument();
  });

  it('saisie à la main, elle ne bouge plus ; le pas-à-pas dit « — » quand elle n’est pas un nombre de mois', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(screen.getByText('2 mois')).toBeInTheDocument());
    await user.clear(screen.getByLabelText(/^Caution/));
    await user.type(screen.getByLabelText(/^Caution/), '1000000');

    await user.clear(screen.getByLabelText(/^Loyer/));
    await user.type(screen.getByLabelText(/^Loyer/), '700000');

    expect(espaces(valeur(/^Caution/))).toBe('1 000 000');
    expect(screen.queryByText(/^\d+ mois$/)).toBeNull();
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('CreateLeaseForm — un seul envoi (TCK-2643, r3)', () => {
  it('deux clics dans la même tâche sur « Créer le brouillon » : un seul POST', async () => {
    const r = enAttente();
    CREATION.mutateAsync.mockImplementation(() => r.p);
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));
    await user.type(screen.getByLabelText('Début'), '2026-12-01');

    const bouton = screen.getByRole('button', { name: 'Créer le brouillon' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);

    await waitFor(() => expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1));
    await new Promise((res) => setTimeout(res, 100));
    expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1);
    r.liberer();
    await waitFor(() => expect(ROUTEUR.push).toHaveBeenCalledWith('/app/leases/1'));
  });

  it('deux clics dans la même tâche sur « Envoyer à la signature » : un bail, une demande de signature', async () => {
    const r = enAttente();
    CREATION.mutateAsync.mockImplementation(() => r.p);
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));
    await user.type(screen.getByLabelText('Début'), '2026-12-01');

    const bouton = screen.getByRole('button', { name: 'Envoyer à la signature' });
    fireEvent.click(bouton);
    fireEvent.click(bouton);
    await waitFor(() => expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1));
    r.liberer();

    await waitFor(() => expect(SIGNATURE.mutateAsync).toHaveBeenCalledTimes(1));
    await new Promise((res) => setTimeout(res, 100));
    expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1);
    expect(SIGNATURE.mutateAsync).toHaveBeenCalledTimes(1);
  });
});

describe('CreateLeaseForm — un locataire illisible (TCK-2643, r4)', () => {
  it('?customer= que l’API ne rend pas : on reste à l’étape du locataire, sans locataire choisi', async () => {
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={999} />));

    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));
    expect(etapeCourante()).toBe('2Locataire');
    expect(screen.queryByRole('button', { name: 'Changer le locataire' })).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Locataire' })).toHaveTextContent('Sélectionner un locataire');
  });

  it('?customer= lisible : on entre aux conditions, le locataire retenu', () => {
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    expect(etapeCourante()).toBe('3Conditions');
    expect(screen.getByRole('button', { name: 'Changer le locataire' })).toBeInTheDocument();
  });
});
