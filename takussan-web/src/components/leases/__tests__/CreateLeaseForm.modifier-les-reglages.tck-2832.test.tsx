import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Controller, type Control, type FieldValues } from 'react-hook-form';

import { withIntl } from '@/test/intl';

/**
 * TCK-2832 — « Modifier » dans l'encart « Réglages de l'agence appliqués » du nouveau bail : montré à
 * qui l'API dit pouvoir écrire ces réglages (`can_edit_agency_settings`), jamais déduit du rôle ; il
 * mène à `/app/agency/lease-settings` dans un nouvel onglet, pour que la saisie du bail ne se perde pas.
 *
 * Mocks repris de `CreateLeaseForm.creation.tck-2643.test.tsx` (TCK-2643, ci-dessous) :
 *
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


describe('CreateLeaseForm — « Modifier » les réglages de l’agence (TCK-2832)', () => {
  it('AC3 — à qui peut écrire les réglages : un lien vers l’écran, dans un nouvel onglet', async () => {
    DEFAUTS.set(11, { data: { ...(DEFAUTS.get(11)!.data as object), can_edit_agency_settings: true } });
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));

    const encart = (await screen.findByText('Réglages de l’agence appliqués')).closest('div') as HTMLElement;
    const lien = within(encart).getByRole('link', { name: /Modifier/ });
    expect(lien).toHaveAttribute('href', '/app/agency/lease-settings');
    expect(lien).toHaveAttribute('target', '_blank');
    expect(lien).toHaveAccessibleName(/^Modifier ?les réglages de l’agence \(s’ouvre dans un nouvel onglet\)$/);
    expect(lien).toHaveAttribute('rel', 'noopener');
  });

  it.each([
    ['refusé par l’API (agent, bailleur)', false],
    ['non dit par l’API', undefined],
  ])('AC3 — %s : pas de « Modifier »', async (_cas, drapeau) => {
    DEFAUTS.set(11, { data: { ...(DEFAUTS.get(11)!.data as object), can_edit_agency_settings: drapeau } });
    render(withIntl(<CreateLeaseForm propertyId={11} customerId={7} />));

    const encart = (await screen.findByText('Réglages de l’agence appliqués')).closest('div') as HTMLElement;
    expect(within(encart).queryByRole('link', { name: /Modifier/ })).toBeNull();
  });
});
