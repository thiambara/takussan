/**
 * Échéancier du bail — TCK-505 (défaut #5) puis TCK-593.
 *
 * TCK-505 avait mesuré à 390 px une table de 396 px sous un conteneur `overflow-hidden` : la colonne
 * « Payer en ligne » coupée sans défilement. Le correctif d'alors faisait DÉFILER la table. TCK-593
 * ajoute deux gestes par échéance (quittance, pénalité réglée) : la table cède la place à une liste
 * qui se replie en carte, et le conteneur ne défile plus du tout. jsdom ne mesure rien — le
 * `scrollWidth === clientWidth` se relève au navigateur ; ici on fixe la STRUCTURE qui le permet.
 *
 * TCK-593 (Parties 2 et 3) — l'échéancier lit les montants tels que l'API les rend : la pénalité
 * appliquée (`late_fee_amount`), le montant dû (`amount_due`), la quittance (`receipt_available`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ApiError } from '@/lib/api';
import type { LeasePayment } from '@/types/lease';
import { LeaseSchedule } from '../LeaseSchedule';

const useLeasePayments = vi.fn();
const markLateFeePaid = vi.fn();
const providers = vi.fn<() => string[]>(() => []);

/**
 * Passe 2 (M5) — le refus que l'API rendrait au PREMIER enregistrement (sans passage outre). Rejeté
 * hors de `vi.fn()` : sous Vitest 4, une promesse rejetée rendue par un `vi.fn()` est signalée non
 * gérée même quand l'appelant l'attrape.
 */
let refusSansPassageOutre: unknown = null;

vi.mock('@/lib/queries/leases', () => ({
  useLeasePayments: (...args: unknown[]) => useLeasePayments(...args),
  useMarkLateFeePaid: () => ({
    mutateAsync: (variables: { override_open_checkout?: boolean }) =>
      refusSansPassageOutre !== null && !variables.override_open_checkout
        ? Promise.reject(refusSansPassageOutre)
        : markLateFeePaid(variables),
    isPending: false,
  }),
}));

vi.mock('@/hooks/usePaymentProviders', () => ({
  usePaymentProviders: () => ({ providers: providers() }),
}));

vi.mock('@/hooks/useInitiatePayment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useInitiatePayment')>()),
  useInitiatePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const toastAdd = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: toastAdd }),
}));

/** Le lecteur : l'utilisateur 50, et ses profils (passe 3, m3 — qui peut passer outre). */
let profils: { type: string; agency_id: number | null; status: string | null }[] = [];

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 50 } }),
}));

vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: { data: profils } }),
}));

const AGENT_DE_L_AGENCE = { type: 'agent', agency_id: 1, status: 'active' };

/** Espaces fines et insécables d'`Intl` ramenées à l'espace simple. */
const texte = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ');

const PAYEE: LeasePayment = {
  id: 11,
  lease_id: 1,
  payer_id: 4,
  collector_id: null,
  reference_number: 'LP-2026-0011',
  amount: 250000,
  currency: 'XOF',
  payment_method: null,
  payment_type: 'rent',
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  due_date: '2026-07-05',
  paid_at: '2026-07-03T00:00:00+00:00',
  status: 'paid',
  paid_amount: 250000,
  remaining_amount: 0,
  late_fee_amount: null,
  late_fee_applied_at: null,
  late_fee_paid_at: null,
  late_fee_outstanding: 0,
  late_fee_payable_online: false,
  amount_due: 0,
  receipt_available: true,
  notes: null,
  created_at: '2026-07-01T00:00:00+00:00',
};

/** L'échéance des AC : 150 000 de loyer, 7 500 de pénalité appliquée et non réglée. */
function enRetard(surcharge: Partial<LeasePayment> = {}): LeasePayment {
  return {
    ...PAYEE,
    id: 12,
    reference_number: 'LP-2026-0012',
    amount: 150000,
    period_start: '2026-08-01',
    period_end: '2026-08-31',
    due_date: '2026-08-05',
    paid_at: null,
    status: 'late',
    paid_amount: 0,
    remaining_amount: 150000,
    late_fee_amount: 7500,
    late_fee_applied_at: '2026-08-15T00:00:00+00:00',
    late_fee_outstanding: 7500,
    late_fee_payable_online: false,
    amount_due: 150000,
    receipt_available: false,
    ...surcharge,
  };
}

function avecEcheances(echeances: LeasePayment[]) {
  useLeasePayments.mockReturnValue({
    data: { data: echeances },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
}

function rendre(canManage = false, bail: { agencyId?: number | null; landlordId?: number } = {}) {
  const { agencyId = 1, landlordId = 7 } = bail;
  return render(
    withIntl(<LeaseSchedule leaseId={1} agencyId={agencyId} landlordId={landlordId} canManage={canManage} />),
  );
}

/** Le 409 que l'API rend tant qu'un checkout incluant la pénalité vit. */
function refusCheckoutEnCours() {
  return new ApiError(409, {
    message: 'Un paiement en ligne est en cours sur cette échéance.',
    code: 'checkout_in_progress',
    checkout: { amount: 157500, currency: 'XOF', retry_after: '2026-10-07T10:30:00+00:00' },
  });
}

function ligne(reference: RegExp) {
  return screen.getAllByRole('listitem').find((li) => reference.test(texte(li.textContent)))!;
}

beforeEach(() => {
  refusSansPassageOutre = null;
  profils = [AGENT_DE_L_AGENCE];
  vi.clearAllMocks();
  providers.mockReturnValue([]);
  avecEcheances([PAYEE]);
});

describe('LeaseSchedule — utilisable sur téléphone (TCK-505 #5, TCK-593 Partie 2)', () => {
  it('rend une LISTE d’échéances, plus une table à faire défiler', () => {
    rendre();
    expect(screen.queryByRole('table')).toBeNull();
    const liste = screen.getByRole('list', { name: fr.lease.schedule.listLabel });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(1);
  });

  it('ne force aucune largeur : rien ne refuse de revenir à la ligne ni ne fixe de minimum', () => {
    avecEcheances([PAYEE, enRetard()]);
    providers.mockReturnValue(['wave']);
    rendre(true);
    const liste = screen.getByTestId('echeancier');

    expect(liste.className).not.toMatch(/overflow-x-(auto|scroll)/);
    // Les blocs de mise en page — pas les badges ni les boutons, courts par construction.
    for (const el of [liste, ...liste.querySelectorAll(':scope > li, :scope > li > div, :scope > li > div > p')]) {
      expect(String(el.getAttribute('class') ?? '')).not.toMatch(/whitespace-nowrap|min-w-\[|(^|\s)w-\[/);
    }
    // Une ligne est une carte empilée sous `lg`, une rangée au-delà.
    for (const li of within(liste).getAllByRole('listitem')) {
      expect(li).toHaveClass('flex-col', 'lg:flex-row');
    }
  });
});

describe('LeaseSchedule — montants lus tels que l’API les rend (TCK-593 Partie 3)', () => {
  it('affiche la pénalité appliquée : « +7 500 F CFA » (le « FCFA » des AC, tel qu’Intl le rend) pour late_fee_amount = 7500', () => {
    avecEcheances([enRetard()]);
    rendre();
    expect(texte(screen.getByTestId('penalite').textContent)).toBe('+7 500 F CFA');
  });

  it('rappelle à part une pénalité que l’agence n’encaisse pas en ligne', () => {
    avecEcheances([enRetard({ late_fee_payable_online: false })]);
    rendre();
    expect(screen.getByText(fr.lease.schedule.lateFee.atAgency)).toBeInTheDocument();
  });

  it('le type ne réintroduit pas `late_fee` : la clé n’existe pas dans la ressource', () => {
    const source = readFileSync(resolve(__dirname, '../../../types/lease.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*late_fee\??\s*:/m);
    expect(source).toMatch(/^\s*late_fee_amount\s*:/m);
  });
});

describe('LeaseSchedule — gestes par échéance (TCK-593 Partie 2)', () => {
  it('« Payer » seulement quand amount_due > 0 : jamais sur une payée, toujours sur une échouée', () => {
    providers.mockReturnValue(['wave']);
    avecEcheances([
      PAYEE,
      enRetard(),
      enRetard({ id: 13, reference_number: 'LP-2026-0013', status: 'failed', late_fee_amount: null, late_fee_outstanding: 0 }),
      enRetard({ id: 14, reference_number: 'LP-2026-0014', status: 'refunded', amount_due: 0, late_fee_amount: null, late_fee_outstanding: 0 }),
    ]);
    rendre();
    const payer = /^Payer /;

    expect(within(ligne(/LP-2026-0011|1 juil/)).queryByRole('button', { name: payer })).toBeNull();
    expect(within(ligne(/1 août 2026.*\+7 500/)).getByRole('button', { name: payer })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: payer })).toHaveLength(2);
  });

  it('« Quittance PDF » sur une échéance dont la quittance est disponible, et seulement elle', () => {
    avecEcheances([PAYEE, enRetard()]);
    rendre();
    expect(screen.getAllByRole('button', { name: fr.lease.schedule.receiptPdf })).toHaveLength(1);
  });

  it('« Pénalité réglée » pour qui gère le bail, et la mutation vise l’échéance', () => {
    avecEcheances([PAYEE, enRetard()]);
    markLateFeePaid.mockResolvedValue({});
    rendre(true);

    fireEvent.click(screen.getByRole('button', { name: fr.lease.schedule.lateFee.markPaid }));
    expect(markLateFeePaid).toHaveBeenCalledWith({ paymentId: 12 });
  });

  it('un checkout en ligne en cours : passer outre exige la confirmation et un motif (M5)', async () => {
    avecEcheances([enRetard()]);
    markLateFeePaid.mockResolvedValue({});
    refusSansPassageOutre = new ApiError(409, {
      message: 'Un paiement en ligne est en cours sur cette échéance.',
      code: 'checkout_in_progress',
      checkout: { amount: 157500, currency: 'XOF', retry_after: '2026-10-07T10:30:00+00:00' },
    });
    rendre(true);

    fireEvent.click(screen.getByRole('button', { name: fr.lease.schedule.lateFee.markPaid }));
    const dialogue = await screen.findByRole('dialog');
    const o = fr.lease.schedule.lateFee.override;
    expect(texte(within(dialogue).getByText(/Un paiement en ligne de/).textContent)).toContain('157 500 F CFA');
    expect(markLateFeePaid).not.toHaveBeenCalled();

    const enregistrer = within(dialogue).getByRole('button', { name: o.submit });
    expect(enregistrer).toBeDisabled();
    // Le motif seul ne suffit pas : la case de confirmation est requise.
    fireEvent.change(within(dialogue).getByLabelText(o.reason), { target: { value: ' Espèces au guichet ' } });
    expect(enregistrer).toBeDisabled();
    fireEvent.click(within(dialogue).getByRole('checkbox', { name: o.confirm }));
    expect(enregistrer).toBeEnabled();
    // La case seule non plus : sans motif, rien ne part.
    fireEvent.change(within(dialogue).getByLabelText(o.reason), { target: { value: '   ' } });
    expect(enregistrer).toBeDisabled();
    fireEvent.change(within(dialogue).getByLabelText(o.reason), { target: { value: ' Espèces au guichet ' } });

    fireEvent.click(enregistrer);
    await waitFor(() =>
      expect(markLateFeePaid).toHaveBeenCalledWith({
        paymentId: 12,
        override_open_checkout: true,
        override_reason: 'Espèces au guichet',
      }),
    );
    refusSansPassageOutre = null;
  });

  it('qui ne peut pas passer outre lit le 409, sans offre de passer outre (passe 3, m3)', async () => {
    const lecteurs: [string, typeof profils][] = [
      ['le bailleur du bail d’agence', [{ type: 'owner', agency_id: 1, status: 'active' }]],
      ['l’agent d’une autre agence', [{ type: 'agent', agency_id: 2, status: 'active' }]],
      ['l’agent suspendu', [{ type: 'agent', agency_id: 1, status: 'suspended' }]],
    ];
    for (const [qui, ses] of lecteurs) {
      profils = ses;
      toastAdd.mockClear();
      avecEcheances([enRetard()]);
      refusSansPassageOutre = refusCheckoutEnCours();
      // Le bailleur du bail (50) — c'est un bail D'AGENCE : il n'y passe pas outre.
      const { unmount } = rendre(true, { landlordId: 50 });

      fireEvent.click(screen.getByRole('button', { name: fr.lease.schedule.lateFee.markPaid }));
      await waitFor(() => expect(toastAdd, qui).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('dialog'), qui).toBeNull();
      const { title, type } = toastAdd.mock.calls[0][0] as { title: string; type: string };
      expect(type).toBe('error');
      expect(texte(title), qui).toMatch(/^Un paiement en ligne de 157 500 F CFA est déjà en cours/);
      unmount();
    }
  });

  it('sur un bail sans agence, son bailleur se voit offrir de passer outre (passe 3, m2)', async () => {
    profils = [];
    avecEcheances([enRetard()]);
    refusSansPassageOutre = refusCheckoutEnCours();
    rendre(true, { agencyId: null, landlordId: 50 });

    fireEvent.click(screen.getByRole('button', { name: fr.lease.schedule.lateFee.markPaid }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('sur un bail sans agence, un autre que son bailleur lit le 409 (passe 3, m3)', async () => {
    profils = [AGENT_DE_L_AGENCE];
    avecEcheances([enRetard()]);
    refusSansPassageOutre = refusCheckoutEnCours();
    rendre(true, { agencyId: null, landlordId: 7 });

    fireEvent.click(screen.getByRole('button', { name: fr.lease.schedule.lateFee.markPaid }));
    await waitFor(() => expect(toastAdd).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('pas de « Pénalité réglée » pour le locataire', () => {
    avecEcheances([enRetard()]);
    rendre(false);
    expect(screen.queryByRole('button', { name: fr.lease.schedule.lateFee.markPaid })).toBeNull();
  });
});

describe('LeaseSchedule — le montant annoncé est celui que la passerelle encaissera (AC12)', () => {
  it('pénalité NON encaissée en ligne : bouton à 150 000, pénalité rappelée à part', async () => {
    providers.mockReturnValue(['wave']);
    avecEcheances([enRetard({ late_fee_payable_online: false, amount_due: 150000 })]);
    rendre();

    const bouton = screen.getByRole('button', { name: /^Payer / });
    expect(texte(bouton.textContent)).toBe('Payer 150 000 F CFA');

    fireEvent.click(bouton);
    const dialogue = await screen.findByRole('dialog');
    expect(texte(within(dialogue).getByTestId('montant-total').textContent)).toBe('150 000 F CFA');
    expect(within(dialogue).queryByText(fr.payments.gateway.breakdown.lateFee)).toBeNull();
    expect(texte(within(dialogue).getByText(/auprès de l’agence/).textContent)).toContain('7 500 F CFA');
  });

  it('pénalité encaissée en ligne : loyer, puis pénalité, puis le total rendu par l’API', async () => {
    providers.mockReturnValue(['wave']);
    avecEcheances([enRetard({ late_fee_payable_online: true, amount_due: 157500 })]);
    rendre();

    fireEvent.click(screen.getByRole('button', { name: /^Payer / }));
    const dialogue = await screen.findByRole('dialog');
    const termes = within(dialogue).getAllByRole('term').map((dt) => dt.textContent);
    expect(termes).toEqual([
      fr.payments.gateway.breakdown.rent,
      fr.payments.gateway.breakdown.lateFee,
      fr.payments.gateway.breakdown.total,
    ]);
    const valeurs = within(dialogue).getAllByRole('definition').map((dd) => texte(dd.textContent));
    expect(valeurs).toEqual(['150 000 F CFA', '7 500 F CFA', '157 500 F CFA']);
    expect(within(dialogue).queryByText(/auprès de l’agence/)).toBeNull();
  });
});
