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
const RELEVE_ARGS = vi.hoisted(() => [] as unknown[][]);
const RELEVE = vi.hoisted(() => ({ data: undefined, isLoading: false, isError: false, error: null }));
vi.mock('@/lib/queries/payments', () => ({
  useOwnerStatement: (...args: unknown[]) => {
    RELEVE_ARGS.push(args);
    return RELEVE;
  },
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
const OWNERS_ARGS = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    OWNERS_ARGS.push(args);
    return OWNERS;
  },
}));
const AUTH = vi.hoisted(() => ({ user: { id: 9, agency_id: 3 }, token: 'jeton' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));

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

  it('propose les bailleurs actifs et inactifs, à qui des loyers peuvent rester dus (P120.04)', () => {
    monter();

    const [, chemin, options] = OWNERS_ARGS.at(-1) as [unknown, string, { params: { filter: Record<string, unknown> } }];
    expect(chemin).toBe('/api/owners');
    expect(options.params.filter.status).toEqual(['active', 'inactive']);
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

describe('CreatePayoutDialog — le relevé du bailleur choisi, avant de reverser (TCK-1016, P50.04)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    RELEVE_ARGS.length = 0;
    PREPARATION.current = { data: undefined, isError: false, isFetching: false, error: null };
  });

  it("n'offre le relevé qu'une fois le bailleur choisi, et le demande pour lui et le mois de la période", async () => {
    const user = userEvent.setup();
    monter();

    expect(screen.queryByRole('button', { name: 'Voir le relevé du mois' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Bailleur'), '42');
    await user.type(screen.getByLabelText('Début de période'), '2026-09-01');
    const bouton = screen.getByRole('button', { name: 'Voir le relevé du mois' });
    expect(bouton).toHaveAttribute('aria-expanded', 'false');
    expect(RELEVE_ARGS).toHaveLength(0);

    await user.click(bouton);

    expect(bouton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Relevé de gérance' })).toBeInTheDocument();
    expect(RELEVE_ARGS.at(-1)).toEqual(['2026-09', 42]);
  });
});

describe('CreatePayoutDialog — la commission de la plateforme, portée par l\'agence (TCK-2074, P178.03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    PREPARATION.current = { data: undefined, isError: false, isFetching: false, error: null };
  });

  const enLigne = {
    id: 103, reference_number: 'LP-3', payment_type: 'rent', lease_id: 8, lease_reference: 'BAIL-8', property_id: 2,
    paid_at: '2026-09-15T10:00:00Z', amount: 150000, commission_rate: 0, commission_rate_source: 'lease', commission: 0,
    settled_by_platform: true, platform_fee_rate: 5, platform_fee: 7500, agency_received: 142500, commission_below_platform_fee: true,
  };
  const especes = {
    ...CALCUL.data.lines.lease_payments[0],
    settled_by_platform: false, platform_fee_rate: null, platform_fee: null, agency_received: null, commission_below_platform_fee: false,
  };

  function calcul(lignes: unknown[], platformFee: number) {
    return {
      data: {
        ...CALCUL.data,
        requires_approval: false,
        lines: { lease_payments: lignes, booking_payments: [], service_provider_bills: [] },
        totals: { gross: 350000, commission: 20000, fees: 0, net: 330000, platform_fee: platformFee },
      },
    };
  }

  it('montre la commission de la plateforme et ce que l\'agence a reçu, et avertit sans bloquer', () => {
    PREPARATION.current = { data: calcul([enLigne, especes], 7500), isError: false, isFetching: false, error: null };
    monter();

    const ligne = screen.getByText('Loyer — bail BAIL-8').closest('tr');
    expect(sansEspaces(ligne?.textContent ?? '')).toContain(sansEspaces('Commission de la plateforme : 7 500 FCFA (5 %) · reçu par l\'agence : 142 500 FCFA'));
    const autre = screen.getByText('Loyer — bail BAIL-7').closest('tr');
    expect(autre?.textContent).not.toContain('plateforme');
    const total = screen.getAllByText('Commission de la plateforme, portée par l\'agence').find((el) => el.tagName === 'DT');
    expect(sansEspaces(total?.nextElementSibling?.textContent ?? '')).toBe('7500FCFA');
    expect(screen.getByRole('status')).toHaveTextContent(/inférieure à celle de la plateforme/);
    expect(screen.getByRole('button', { name: 'Créer le reversement' })).toBeEnabled();
  });

  it("ne dit rien de la plateforme quand aucune pièce n'est passée par elle", () => {
    PREPARATION.current = { data: calcul([especes], 0), isError: false, isFetching: false, error: null };
    monter();

    expect(screen.queryByText(/plateforme/)).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe("CreatePayoutDialog — « encaissé par la plateforme » sur la ligne (TCK-2076, P178.04)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marque la pièce encaissée par la plateforme, et elle seule', () => {
    const base = CALCUL.data.lines.lease_payments[0];
    const sansPlateforme = { settled_by_platform: false, platform_fee_rate: null, platform_fee: null, agency_received: null, commission_below_platform_fee: false };
    PREPARATION.current = {
      data: {
        data: {
          ...CALCUL.data,
          requires_approval: false,
          lines: {
            lease_payments: [
              { ...base, id: 201, lease_reference: 'BAIL-EN-LIGNE', ...sansPlateforme, settled_by_platform: true, platform_fee_rate: 5, platform_fee: 10000, agency_received: 190000 },
              { ...base, id: 202, lease_reference: 'BAIL-ESPECES', ...sansPlateforme },
            ],
            booking_payments: [],
            service_provider_bills: [],
          },
          totals: { ...CALCUL.data.totals, platform_fee: 10000 },
        },
      },
      isError: false,
      isFetching: false,
      error: null,
    };
    monter();

    expect(screen.getByText('Loyer — bail BAIL-EN-LIGNE').closest('td')).toHaveTextContent('Encaissé par la plateforme');
    expect(screen.getByText('Loyer — bail BAIL-ESPECES').closest('td')).not.toHaveTextContent('Encaissé par la plateforme');
  });
});
