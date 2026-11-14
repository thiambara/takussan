import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Controller, type Control, type FieldValues } from 'react-hook-form';

import { withIntl } from '@/test/intl';

/**
 * TCK-2643 — la création d'un bail en quatre étapes, préremplie depuis le bien et les réglages de
 * l'agence (`GET /api/leases/defaults`).
 *
 * - AC1 : un bien à 670 000 F et 2 mois de caution → « 2 mois = 1 340 000 », envoyé tel quel ;
 * - AC2 : la source de chaque valeur se dit (« Réglage de l'agence », « Réglage de la plateforme ») ;
 * - AC3 : pénalité et indemnité partent avec le POST ;
 * - AC4 : « Envoyer à la signature » = POST du bail, PUIS demande de signature ; un échec de la
 *   seconde laisse le brouillon, et l'écran le dit (aucun second POST) ;
 * - préremplir n'est pas imposer : une valeur saisie n'est pas réécrite, ni celle d'une réservation.
 *
 * Le sélecteur de date (`FormDatePicker`, un calendrier en surcouche) est remplacé par un champ texte :
 * ce fichier juge le préremplissage et l'envoi, pas le calendrier.
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
  CREATION.mutateAsync.mockClear();
  SIGNATURE.mutateAsync.mockReset();
  SIGNATURE.mutateAsync.mockImplementation(async () => ({ data: {} }));
  ROUTEUR.push.mockClear();
});

describe('CreateLeaseForm — préremplissage depuis le bien (TCK-2643)', () => {
  it('AC1 — 2 mois de caution sur un loyer de 670 000 : « 2 mois = 1 340 000 », sans saisie', async () => {
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));

    await waitFor(() => expect(espaces(valeur(/^Loyer/))).toBe('670 000'));
    expect(screen.getByText('2 mois')).toBeInTheDocument();
    expect(espaces(valeur(/^Caution/))).toBe('1 340 000');
    expect(espaces(valeur(/^Charges/))).toBe('25 000');
    expect(screen.getByText('Loyer annoncé sur la fiche du bien')).toBeInTheDocument();
  });

  it('AC2 — la source se dit : réglage de l’agence pour la pénalité, de la plateforme pour l’échéance', async () => {
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));

    await waitFor(() => expect(valeur('Taux de la pénalité de retard, en pourcentage')).toBe('5'));
    expect(valeur('Délai de grâce, en jours')).toBe('5');
    expect(screen.getByText('Réglage de l’agence')).toBeInTheDocument();
    // L'échéance et l'indemnité viennent du catalogue.
    expect(screen.getAllByText('Réglage de la plateforme')).toHaveLength(2);
    expect(screen.getByText('Réglages de l’agence appliqués')).toBeInTheDocument();
    // Décision 3 — le taux de l'agence est une information, pas un champ du bail.
    expect(screen.getByText('Taux de l’agence, appliqué aux reversements')).toBeInTheDocument();
  });

  it('le total à l’entrée est celui du coût d’entrée, sur les valeurs du formulaire', async () => {
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));

    const total = await screen.findByText((_, el) => el?.getAttribute('data-slot') === 'total-a-l-entree');
    await waitFor(() => expect(espaces(total.textContent ?? '')).toContain('2 035 000 F'));
    expect(espaces(total.textContent ?? '')).toContain('Loyer 670 000 F + charges 25 000 F + caution 1 340 000 F');
    // La candidature du locataire se complète ; celle de l'autre client se ferme — à l'ENVOI en signature
    // (TCK-2734, décision 7b), plus à la création du brouillon.
    expect(screen.getByText('L’envoi en signature clôturera 1 autre candidature en cours sur ce bien.')).toBeInTheDocument();
    expect(screen.queryByText(/Créer ce bail clôturera/)).not.toBeInTheDocument();
  });

  it('une valeur saisie avant le choix du bien n’est pas réécrite ; les autres se préremplissent', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm />));

    await user.type(screen.getByLabelText(/^Loyer/), '500000');
    await user.click(screen.getByRole('combobox', { name: /^Bien/ }));
    await user.click(await screen.findByRole('option', { name: /Appartement F3/ }));

    await waitFor(() => expect(espaces(valeur(/^Charges/))).toBe('25 000'));
    expect(espaces(valeur(/^Loyer/))).toBe('500 000');
    expect(screen.queryByText('Loyer annoncé sur la fiche du bien')).toBeNull();
  });

  it('AC3 — le brouillon part avec la caution, les charges, la pénalité et l’indemnité préremplies', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));

    await user.type(screen.getByLabelText('Début'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Créer le brouillon' }));

    await waitFor(() => expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1));
    const corps = CREATION.mutateAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(corps).toMatchObject({
      property_id: 11,
      tenant_id: 7,
      monthly_rent: 670_000,
      monthly_charges: 25_000,
      deposit_amount: 1_340_000,
      late_fee_percent: 5,
      late_fee_grace_days: 5,
      early_termination_penalty_months: 3,
      payment_day: 1,
    });
    // Décision 3 — jamais le taux de l'agence recopié ; le plafond de révision reste celui de l'agence.
    expect(corps).not.toHaveProperty('commission_rate');
    expect(corps).not.toHaveProperty('rent_review_max_pct');
    expect(SIGNATURE.mutateAsync).not.toHaveBeenCalled();
    expect(ROUTEUR.push).toHaveBeenCalledWith('/app/leases/1');
  });

  it('la caution se règle au pas-à-pas : 3 mois = 2 010 000', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(screen.getByText('2 mois')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Un mois de plus' }));

    expect(screen.getByText('3 mois')).toBeInTheDocument();
    expect(espaces(valeur(/^Caution/))).toBe('2 010 000');
  });
});

describe('CreateLeaseForm — « Envoyer à la signature » (TCK-2643, AC4)', () => {
  it('POST du bail, PUIS demande de signature du bail créé', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));

    await user.type(screen.getByLabelText('Début'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Envoyer à la signature' }));

    await waitFor(() => expect(SIGNATURE.mutateAsync).toHaveBeenCalledWith({ leaseId: 1 }));
    expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1);
    expect(CREATION.mutateAsync.mock.invocationCallOrder[0]).toBeLessThan(SIGNATURE.mutateAsync.mock.invocationCallOrder[0]!);
    expect(ROUTEUR.push).toHaveBeenCalledWith('/app/leases/1');
  });

  it('un échec de la signature laisse le brouillon, le dit, et ne recrée rien', async () => {
    SIGNATURE.mutateAsync.mockImplementation(async () => {
      throw new Error('panne');
    });
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    await waitFor(() => expect(espaces(valeur(/^Caution/))).toBe('1 340 000'));
    const avis = 'L’envoi en signature clôturera 1 autre candidature en cours sur ce bien.';
    expect(screen.getByText(avis)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Début'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Envoyer à la signature' }));

    const alerte = await screen.findByText(/Le brouillon du bail est créé, mais l’envoi à la signature a échoué/);
    // L'envoi est fermé (bouton désactivé) : l'avis de ce qu'il ferait se tait avec lui.
    expect(screen.queryByText(avis)).not.toBeInTheDocument();
    expect(within(alerte.parentElement!).getByRole('link', { name: 'Ouvrir le brouillon' })).toHaveAttribute('href', '/app/leases/1');
    expect(ROUTEUR.push).not.toHaveBeenCalled();
    expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Envoyer à la signature' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Créer le brouillon' })).toBeDisabled();
  });

  it('un locataire sans compte : l’envoi à la signature est fermé, et l’écran dit pourquoi', async () => {
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={8} />));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Envoyer à la signature' })).toBeDisabled());
    expect(screen.getByText(/Awa Diop n’a pas encore de compte/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer le brouillon' })).toBeEnabled();
    // Les défauts (et leurs candidatures) sont arrivés : le total en dépend.
    const total = await screen.findByText((_, el) => el?.getAttribute('data-slot') === 'total-a-l-entree');
    await waitFor(() => expect(espaces(total.textContent ?? '')).toContain('2 035 000 F'));
    // L'envoi fermé ne close rien : l'avis des candidatures (celle du client 7) ne se dit pas (décision 7b).
    expect(screen.queryByText(/L’envoi en signature clôturera/)).not.toBeInTheDocument();
  });
});

describe('CreateLeaseForm — vente et réservation (TCK-2643)', () => {
  it('un bien à vendre prérempli une vente : prix de vente, ni loyer ni terme de location envoyé', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={12} customerId={7} />));

    await waitFor(() => expect(espaces(valeur(/^Prix de vente/))).toBe('45 000 000'));
    expect(screen.queryByLabelText(/^Loyer/)).toBeNull();
    expect(screen.queryByText('Pénalité de retard')).toBeNull();

    await user.type(screen.getByLabelText('Début'), '2026-12-01');
    await user.click(screen.getByRole('button', { name: 'Créer le brouillon' }));

    await waitFor(() => expect(CREATION.mutateAsync).toHaveBeenCalledTimes(1));
    const corps = CREATION.mutateAsync.mock.calls[0]![0] as Record<string, unknown>;
    expect(corps).toMatchObject({ type: 'sale', sale_price: 45_000_000 });
    expect(corps.late_fee_percent).toBeUndefined();
    expect(corps.early_termination_penalty_months).toBeUndefined();
    expect(corps.monthly_charges).toBeUndefined();
    expect(corps.monthly_rent).toBeUndefined();
  });

  it('les valeurs de la réservation l’emportent sur celles du bien', async () => {
    render(withIntl(<CreateLeaseForm bookingId={7} />));

    // Les défauts du bien arrivent (la pénalité de l'agence se remplit)…
    await waitFor(() => expect(valeur('Taux de la pénalité de retard, en pourcentage')).toBe('5'));
    // … mais le loyer reste celui de la réservation.
    expect(espaces(valeur(/^Loyer/))).toBe('250 000');
  });
});

describe('CreateLeaseForm — création rapide du locataire (TCK-2643, décision 8)', () => {
  it('au personnel : prénom, nom et téléphone créent le locataire, retenu pour le bail', async () => {
    CREER_CLIENT.mockResolvedValueOnce({
      ok: true,
      data: { id: 8, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', phone: '+221770000001', email: null, user_id: null },
    });
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} personnel />));

    await user.click(screen.getByRole('button', { name: 'Nouveau locataire' }));
    await user.type(screen.getByLabelText('Prénom'), 'Awa');
    await user.type(screen.getByLabelText('Nom'), 'Diop');
    await user.click(screen.getByRole('button', { name: 'Créer le locataire' }));

    // Le récapitulatif ET le sélecteur le nomment.
    // Retenu pour le bail : il se montre en une ligne, la liste se referme.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Changer le locataire' })).toBeInTheDocument());
    expect(screen.getAllByText('Awa Diop').length).toBeGreaterThan(0);
    expect(CREER_CLIENT).toHaveBeenCalledWith({ first_name: 'Awa', last_name: 'Diop', phone: null });
    // Sans compte : le brouillon, pas la signature.
    expect(screen.getByRole('button', { name: 'Envoyer à la signature' })).toBeDisabled();
  });

  it('une fiche au même téléphone est proposée : « Choisir » la retient', async () => {
    CREER_CLIENT.mockResolvedValueOnce({ ok: false, message: 'doublon', duplicates: [{ id: 7, name: 'Ndèye Sokhna Thiam', matched_on: 'phone' }] });
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm propertyId={11} personnel />));

    await user.click(screen.getByRole('button', { name: 'Nouveau locataire' }));
    await user.type(screen.getByLabelText('Prénom'), 'Ndèye');
    await user.type(screen.getByLabelText('Nom'), 'Thiam');
    await user.click(screen.getByRole('button', { name: 'Créer le locataire' }));
    await user.click(await screen.findByRole('button', { name: 'Choisir' }));

    // Lue par son identifiant (`useLeaseCustomer`) : le nom et le compte de la fiche existante.
    // Le récapitulatif ET le sélecteur le nomment.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Changer le locataire' })).toBeInTheDocument());
    expect(screen.getAllByText('Ndèye Sokhna Thiam').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Envoyer à la signature' })).toBeEnabled();
  });

  it('hors du personnel, pas de création rapide', () => {
    render(withIntl(<CreateLeaseForm propertyId={11} />));
    expect(screen.queryByRole('button', { name: 'Nouveau locataire' })).toBeNull();
  });
});

describe('CreateLeaseForm — les étapes du téléphone (TCK-2643)', () => {
  const etapeCourante = () =>
    within(screen.getByRole('list', { name: 'Étapes de la création du bail' }))
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('aria-current') === 'step')?.textContent;

  it('« Continuer » ne passe pas l’étape tant que son champ manque, puis avance ; « Retour » revient', async () => {
    const user = userEvent.setup();
    render(withIntl(<CreateLeaseForm />));
    expect(etapeCourante()).toBe('1Bien');

    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(etapeCourante()).toBe('1Bien');
    expect(document.getElementById('field-property_id-error')).not.toBeNull();

    await user.click(screen.getByRole('combobox', { name: /^Bien/ }));
    await user.click(await screen.findByRole('option', { name: /Appartement F3/ }));
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    await waitFor(() => expect(etapeCourante()).toBe('2Locataire'));

    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(etapeCourante()).toBe('1Bien');
  });

  it('venu de la fiche du bien et d’un client, on entre aux conditions', () => {
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));
    expect(etapeCourante()).toBe('3Conditions');
  });
});
