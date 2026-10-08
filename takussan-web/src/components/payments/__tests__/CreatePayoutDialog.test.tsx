import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-594 (ADR-0039 §1) — préparer un reversement, c'est choisir un bailleur et une période, puis
 * LIRE le calcul. Le dialogue n'a plus aucun champ de montant, et ce qu'il envoie à la création est
 * la liste des PIÈCES lues, jamais un brut.
 *
 * Des mocks à IDENTITÉ STABLE, comme les vrais hooks : un objet neuf à chaque appel casserait le
 * cache du React Compiler et rendrait un FAUX VERT sous compilation (mesuré, TCK-564 E-repair-1).
 */
const MUTATION = vi.hoisted(() => ({
  mutateAsync: vi.fn(async (_payload: unknown) => ({ data: { id: 31 } })),
  isPending: false,
}));
const PREPARATION = vi.hoisted(() => ({
  current: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    error: null,
  },
}));
const PREPARATION_ARGS = vi.hoisted(() => [] as unknown[]);

const VERIFY = vi.hoisted(() => ({ mutateAsync: vi.fn(async (_payload: unknown) => ({ data: {} })), isPending: false }));
vi.mock('@/lib/queries/payments', () => ({
  useCreatePayout: () => MUTATION,
  useVerifyPayoutMethod: () => VERIFY,
  usePayoutPreparation: (params: unknown) => {
    PREPARATION_ARGS.push(params);
    return PREPARATION.current;
  },
}));
const OWNERS = vi.hoisted(() => ({
  data: {
    data: [
      { id: 5, user_id: 42, agency_id: 3, status: 'active', metadata: null, created_at: null, user: { id: 42, first_name: 'Awa', last_name: 'Diop', email: 'awa@example.test' } },
    ],
  },
  isLoading: false,
}));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => OWNERS }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 9, agency_id: 3 } }) }));

import { CreatePayoutDialog } from '../CreatePayoutDialog';

const sansEspaces = (s: string) => s.replace(/[\s  ]/g, '');

const CALCUL = {
  data: {
    agency_id: 3,
    landlord_id: 42,
    period_start: '2026-09-01',
    period_end: '2026-09-30',
    currency: 'XOF',
    lines: {
      lease_payments: [
        { id: 101, reference_number: 'LP-1', payment_type: 'rent', lease_id: 7, lease_reference: 'BAIL-7', property_id: 1, paid_at: '2026-09-05T10:00:00Z', amount: 200000, commission_rate: 10, commission_rate_source: 'lease', commission: 20000 },
        { id: 102, reference_number: 'LP-2', payment_type: 'charges', lease_id: 7, lease_reference: 'BAIL-7', property_id: 1, paid_at: '2026-09-05T10:00:00Z', amount: 20000, commission_rate: 10, commission_rate_source: 'lease', commission: 2000 },
      ],
      booking_payments: [],
      service_provider_bills: [{ id: 501, reference_number: 'SPB-1', maintenance_request_id: 9, property_id: 1, amount: 15000 }],
    },
    totals: { gross: 220000, commission: 22000, fees: 15000, net: 183000 },
    requires_approval: true,
    approval_threshold: 100000,
    approval_window_days: 27,
    payout_methods: [
      { id: 8, kind: 'wave', masked_identifier: '•••• 4567', is_default: true, verified: true },
      { id: 9, kind: 'orange_money', masked_identifier: '•••• 8899', is_default: false, verified: false },
    ],
  },
};

function monter() {
  render(withIntl(<CreatePayoutDialog open onOpenChange={() => {}} />));
}

describe('CreatePayoutDialog — le calcul se lit, il ne se saisit pas (TCK-594)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PREPARATION_ARGS.length = 0;
    PREPARATION.current = { data: undefined, isError: false, isFetching: false, error: null };
  });

  it("n'offre aucun champ de montant, et rien à créer avant le calcul", () => {
    monter();

    expect(screen.queryByLabelText(/Montant brut/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Commission/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer le reversement' })).toBeDisabled();
  });

  it('demande le calcul pour le bailleur et la période choisis', async () => {
    const user = userEvent.setup();
    monter();

    await user.selectOptions(screen.getByLabelText('Bailleur'), '42');
    await user.type(screen.getByLabelText('Début de période'), '2026-09-01');
    await user.type(screen.getByLabelText('Fin de période'), '2026-09-30');

    expect(PREPARATION_ARGS.at(-1)).toEqual({ landlord_id: 42, period_start: '2026-09-01', period_end: '2026-09-30' });
  });

  it('montre chaque pièce, les totaux et le seuil, puis crée depuis les identifiants', async () => {
    PREPARATION.current = { data: CALCUL, isError: false, isFetching: false, error: null };
    const user = userEvent.setup();
    monter();

    expect(screen.getAllByText('Loyer — bail BAIL-7')).toHaveLength(2);
    expect(screen.getByText('Intervention SPB-1')).toBeInTheDocument();
    const net = screen.getAllByText('Net').find((el) => el.tagName === 'DT');
    expect(sansEspaces(net?.nextElementSibling?.textContent ?? '')).toBe('183000FCFA');
    expect(screen.getByText(/seuil d'approbation/)).toBeInTheDocument();
    // VERIF-594 passe 2, N-3 — la fenêtre du cumul vient du serveur, pas du texte.
    expect(screen.getByText(/depuis 27 jours/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Destination'), '8');
    await user.click(screen.getByRole('button', { name: 'Créer le reversement' }));

    expect(MUTATION.mutateAsync).toHaveBeenCalledTimes(1);
    const payload = MUTATION.mutateAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      landlord_id: 42,
      lease_payment_ids: [101, 102],
      booking_payment_ids: [],
      service_provider_bill_ids: [501],
      period_start: '2026-09-01',
      period_end: '2026-09-30',
      payout_method_id: 8,
    });
    for (const montant of ['gross_amount', 'commission_amount', 'fees_amount', 'net_amount']) {
      expect(payload).not.toHaveProperty(montant);
    }
  });

  it("propose à l'agence de vérifier une destination en attente, et seulement celle-là", async () => {
    PREPARATION.current = { data: CALCUL, isError: false, isFetching: false, error: null };
    const user = userEvent.setup();
    monter();

    await user.selectOptions(screen.getByLabelText('Destination'), '8');
    expect(screen.queryByRole('button', { name: 'Vérifier cette destination' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Destination'), '9');
    await user.click(screen.getByRole('button', { name: 'Vérifier cette destination' }));

    expect(VERIFY.mutateAsync).toHaveBeenCalledWith({ id: 9 });
  });
});

describe('CreatePayoutDialog — la destination par défaut vérifiée est présélectionnée (VERIF-594 N-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PREPARATION.current = { data: CALCUL, isError: false, isFetching: false, error: null };
  });

  it('présélectionne la destination par défaut vérifiée, et l’envoie sans geste', async () => {
    const user = userEvent.setup();
    monter();

    expect((screen.getByLabelText('Destination') as HTMLSelectElement).value).toBe('8');
    await user.click(screen.getByRole('button', { name: 'Créer le reversement' }));
    expect(MUTATION.mutateAsync.mock.calls[0][0]).toMatchObject({ payout_method_id: 8 });
  });

  it('ne présélectionne pas une destination par défaut non vérifiée', () => {
    PREPARATION.current = {
      data: {
        ...CALCUL,
        data: {
          ...CALCUL.data,
          payout_methods: [
            { id: 8, kind: 'wave', masked_identifier: '•••• 4567', is_default: true, verified: false },
            { id: 9, kind: 'orange_money', masked_identifier: '•••• 8899', is_default: false, verified: true },
          ],
        },
      },
      isError: false,
      isFetching: false,
      error: null,
    };
    monter();

    expect((screen.getByLabelText('Destination') as HTMLSelectElement).value).toBe('');
  });
});
