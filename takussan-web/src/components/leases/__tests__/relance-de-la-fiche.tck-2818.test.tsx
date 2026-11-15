/**
 * TCK-2818 — la fiche du bail relance un impayé en MENANT à l'écran Impayés (décision du porteur du
 * 2026-11-14, n° 16 b ; TCK-2775 ouvre la relance depuis l'adresse) : « Relancer » sur la carte Loyer
 * et au menu de la ligne en retard de l'échéancier, au seul personnel qui peut ouvrir l'écran ; sans
 * numéro, « Copier le lien de paiement » et sa raison, aucun `wa.me`.
 *
 * La vraie fiche (`LeaseDetail`) et le vrai échéancier : seules les lectures, les sections voisines et
 * les pages d'administration du lecteur (`AccesAdminProvider`, calculé par le layout de `/app`) sont doublées.
 */
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin, CheminAdmin } from '@/lib/access/pages-admin';
import { withIntl } from '@/test/intl';
import type { LeaseAbilities, LeasePayment } from '@/types/lease';

import { LeaseDetail } from '../LeaseDetail';

const etat = vi.hoisted(() => ({
  lease: {} as Record<string, unknown>,
  paiements: [] as unknown[],
  user: { id: 9, roles: ['agency_admin'] as string[], agency_id: 3 as number | null },
}));
const lienCree = vi.hoisted(() => vi.fn(async () => ({ data: { url: 'https://www.takussan.com/pay/k7Qm2xR9', expires_at: null } })));

vi.mock('@/lib/queries/leases', () => ({
  useLease: () => ({ data: { data: etat.lease }, isLoading: false, isError: false, refetch: vi.fn() }),
  useLeasePayments: () => ({ data: { data: etat.paiements }, isLoading: false, isError: false }),
  useGenerateSchedule: () => ({ mutate: vi.fn(), isPending: false }),
  useReviewLeaseRent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useLeaseGuarantors: () => ({ data: { data: [] } }),
  useMarkLateFeePaid: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useIssuePaymentLink: () => ({ mutateAsync: lienCree, isPending: false }),
}));
vi.mock('@/lib/queries/documents', () => ({ useDocumentsGeneres: () => ({ data: { data: [] } }) }));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: [], isLoading: false }) }));
vi.mock('@/hooks/useInitiatePayment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useInitiatePayment')>()),
  useInitiatePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: { data: [] } }) }));
vi.mock('@/hooks/useVueDansLUrl', () => ({ useVueDansLUrl: () => ({ params: new URLSearchParams(), remplacer: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: etat.user, token: 'jeton' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));
vi.mock('../LeaseSignaturePanel', () => ({ LeaseSignaturePanel: () => null }));
vi.mock('../LeaseChainTimeline', () => ({ LeaseChainTimeline: () => null }));
vi.mock('../DepositRefundBanner', () => ({ DepositRefundBanner: () => null }));
vi.mock('../EarlyTerminationBanner', () => ({ EarlyTerminationBanner: () => null }));
vi.mock('../LeasePaymentDialog', () => ({ LeasePaymentDialog: () => null }));
vi.mock('../LeaseRenewalDialog', () => ({ LeaseRenewalDialog: () => null }));
vi.mock('../EarlyTerminationDialog', () => ({ EarlyTerminationDialog: () => null }));
vi.mock('../fiche/AbandonnerLeBrouillon', () => ({ AbandonnerLeBrouillon: () => null }));
vi.mock('../fiche/FeuilleDeRevision', () => ({ FeuilleDeRevision: () => null }));
vi.mock('../fiche/FeuilleDesGarants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fiche/FeuilleDesGarants')>()),
  FeuilleDesGarants: () => null,
}));
vi.mock('@/components/documents/DocumentUploadDialog', () => ({ DocumentUploadDialog: () => null }));
vi.mock('@/components/reviews/LeaveReviewCta', () => ({ LeaveReviewCta: () => null }));
vi.mock('../fiche/OngletsDuBail', () => ({ OngletDocumentsDuBail: () => null, OngletHistoriqueDuBail: () => null }));
vi.mock('@/components/payments/PayOnlineButton', () => ({ PayOnlineButton: () => null }));

const RIEN: LeaseAbilities = {
  renew: false,
  review_rent: false,
  record_payment: false,
  refund_deposit: false,
  request_early_termination: false,
  update: false,
  add_document: false,
  download_contract: false,
  leave_review: false,
  give_notice: false,
  rent_review_force: false,
};
const GESTION: LeaseAbilities = { ...RIEN, renew: true, review_rent: true, record_payment: true, refund_deposit: true, update: true, add_document: true, download_contract: true };
const LOCATAIRE: LeaseAbilities = { ...RIEN, request_early_termination: true, add_document: true, download_contract: true, leave_review: true, give_notice: true };

/** Le premier jour du mois dans `n` mois (UTC). */
function debutDeMois(n: number): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10);
}

function echeance(partiel: Partial<LeasePayment>): LeasePayment {
  return {
    id: 1,
    payment_type: 'rent',
    status: 'pending',
    due_date: debutDeMois(1),
    period_start: debutDeMois(1),
    amount: 640000,
    amount_due: 640000,
    remaining_amount: 640000,
    currency: 'XOF',
    paid_at: null,
    receipt_available: false,
    is_overdue: false,
    late_fee_amount: null,
    late_fee_outstanding: 0,
    late_fee_payable_online: false,
    ...partiel,
  } as LeasePayment;
}

/** Le loyer d'il y a deux mois, en retard : l'échéance 21. */
const EN_RETARD = echeance({ id: 21, status: 'late', is_overdue: true, due_date: debutDeMois(-2), period_start: debutDeMois(-2) });

function bail(abilities: LeaseAbilities, partiel: Record<string, unknown> = {}) {
  return {
    id: 4,
    reference_number: 'LS-4',
    status: 'active',
    type: 'residential_rent',
    agency_id: 3,
    landlord_id: 40,
    start_date: '2026-01-01',
    end_date: '2028-12-31',
    monthly_rent: 640000,
    deposit_amount: 640000,
    currency: 'XOF',
    payment_day: 5,
    notice_period_days: 90,
    tenant: { id: 1, user_id: 114, first_name: 'Fatou', last_name: 'Wade', phone: '+221770000001' },
    landlord: { id: 40, first_name: 'Sokhna', last_name: 'Sene', full_name: 'Sokhna Sene' },
    property: { id: 12, title: 'Villa Ngor', slug: 'villa-ngor', main_photo_url: null },
    abilities,
    ...partiel,
  };
}

const ADMIN: CheminAdmin[] = ['/app/agency/finances' as CheminAdmin];

function monter(chemins: readonly CheminAdmin[] | null) {
  const ui: ReactElement = <LeaseDetail leaseId={4} />;
  const acces: AccesAdmin | null = chemins ? { chemins, espaceIndividuel: false } : null;
  return render(withIntl(acces ? <AccesAdminProvider acces={acces}>{ui}</AccesAdminProvider> : ui));
}

const LIEN = '/app/agency/finances?tab=impayes&relance=21&bail=4';
const carteLoyer = () => screen.getAllByTestId('carte-loyer')[0]!;
const liensDeRelance = () => screen.queryAllByRole('link', { name: fr.lease.fiche.loyer.relancer });
const toutLeTexte = () => document.body.innerHTML;
/** Les liens `wa.me` qui portent un message (une relance composée), et non le simple contact. */
const messagesWhatsApp = () =>
  [...document.querySelectorAll<HTMLAnchorElement>('a[href*="wa.me"]')].map((a) => new URL(a.href).searchParams.get('text') ?? '').filter((t) => t !== '');

beforeEach(() => {
  etat.lease = bail(GESTION);
  etat.paiements = [EN_RETARD, echeance({ id: 22 })];
  etat.user = { id: 9, roles: ['agency_admin'], agency_id: 3 };
  lienCree.mockClear();
});

describe('TCK-2818 — AC1 : « Relancer » mène à l’écran Impayés, qui ouvre LA relance', () => {
  it('carte Loyer : un lien vers `/app/agency/finances?tab=impayes&relance=<échéance>&bail=<bail>`', () => {
    monter(ADMIN);
    expect(within(carteLoyer()).getByRole('link', { name: fr.lease.fiche.loyer.relancer }).getAttribute('href')).toBe(LIEN);
    // La fiche n'envoie rien, ne crée aucun lien de paiement, et ne compose aucun message `wa.me` elle-même
    // (le seul `wa.me` est le contact du locataire dans « Parties », sans texte).
    expect(lienCree).not.toHaveBeenCalled();
    expect(messagesWhatsApp()).toEqual([]);
  });

  it('menu de la ligne en retard de l’échéancier : « Relancer », le même lien ; une échéance à venir n’en a pas', async () => {
    monter(ADMIN);
    const user = userEvent.setup();
    const menus = screen.getAllByRole('button', { name: /Autres gestes pour/ });
    await user.click(menus[0]!);
    const item = await screen.findByTestId('relancer-l-echeance');
    expect(item.closest('a')?.getAttribute('href') ?? item.getAttribute('href')).toBe(LIEN);
    expect(screen.getAllByTestId('relancer-l-echeance')).toHaveLength(1);
  });
});

describe('TCK-2818 — AC2 : le geste n’est rendu qu’au personnel qui peut ouvrir l’écran Impayés', () => {
  it('le LOCATAIRE (même avec un accès d’admin ailleurs) : aucun « Relancer »', () => {
    etat.lease = bail(LOCATAIRE);
    monter(ADMIN);
    expect(liensDeRelance()).toHaveLength(0);
    expect(screen.queryByTestId('relancer-le-loyer')).toBeNull();
  });

  it('le BAILLEUR (il gère le bail, mais n’ouvre pas l’écran de l’agence) : aucun « Relancer »', () => {
    etat.user = { id: 40, roles: ['owner'], agency_id: 3 };
    monter([]);
    expect(liensDeRelance()).toHaveLength(0);
    expect(screen.queryByTestId('relancer-le-loyer')).toBeNull();
  });

  it('un admin d’une AUTRE agence : aucun « Relancer » (l’écran de la sienne n’a pas cette échéance)', () => {
    etat.user = { id: 9, roles: ['agency_admin'], agency_id: 8 };
    monter(ADMIN);
    expect(liensDeRelance()).toHaveLength(0);
  });

  it('sans pages d’administration fournies : rien n’est offert (fail-closed)', () => {
    monter(null);
    expect(liensDeRelance()).toHaveLength(0);
    expect(screen.queryByTestId('relancer-le-loyer')).toBeNull();
  });

  it('une échéance pas encore en retard (`is_overdue` faux) : aucun « Relancer », ni sur la carte ni au menu', async () => {
    etat.paiements = [echeance({ id: 24, status: 'pending', is_overdue: false, due_date: debutDeMois(0), period_start: debutDeMois(0) })];
    monter(ADMIN);
    expect(liensDeRelance()).toHaveLength(0);
    const user = userEvent.setup();
    const menus = screen.queryAllByRole('button', { name: /Autres gestes pour/ });
    // Le menu de la ligne existe (« Copier le lien de paiement ») : l'absence se lit menu ouvert.
    expect(menus).toHaveLength(1);
    for (const menu of menus) {
      await user.click(menu);
      await screen.findByRole('menu');
    }
    expect(screen.queryByTestId('relancer-l-echeance')).toBeNull();
  });

  it('la pénalité SEULE restée due sur un loyer payé n’est pas un impayé de l’écran : aucun « Relancer »', () => {
    etat.paiements = [echeance({ id: 23, status: 'paid', is_overdue: false, paid_at: '2026-10-09T10:00:00Z', due_date: debutDeMois(-1), period_start: debutDeMois(-1), late_fee_amount: 32000, late_fee_outstanding: 32000, late_fee_reminder_allowed: true })];
    monter(ADMIN);
    expect(liensDeRelance()).toHaveLength(0);
    expect(screen.queryByTestId('relancer-le-loyer')).toBeNull();
  });
});

describe('TCK-2818 — AC3 : un locataire sans téléphone', () => {
  it('« Copier le lien de paiement » et sa raison, aucun « Relancer » ni `wa.me` ; le lien n’est créé qu’au clic', async () => {
    etat.lease = bail(GESTION, { tenant: { id: 1, user_id: 114, first_name: 'Fatou', last_name: 'Wade', phone: null } });
    const ecrire = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: ecrire }, configurable: true });
    monter(ADMIN);

    const geste = within(carteLoyer()).getByTestId('relancer-le-loyer');
    const bouton = within(geste).getByRole('button', { name: fr.lease.liste.relance.copierLeLien });
    expect(bouton).toHaveAccessibleDescription(fr.lease.liste.relance.sansTelephone);
    expect(liensDeRelance()).toHaveLength(0);
    expect(toutLeTexte()).not.toMatch(/wa\.me/);
    expect(lienCree).not.toHaveBeenCalled();

    fireEvent.click(bouton);
    await waitFor(() => expect(ecrire).toHaveBeenCalledWith('https://www.takussan.com/pay/k7Qm2xR9'));
    expect(lienCree).toHaveBeenCalledWith({ paymentId: 21 });
    expect(await within(geste).findByRole('button', { name: fr.lease.liste.relance.lienCopie })).toBeInTheDocument();
  });

  it('… et le menu de la ligne n’offre pas « Relancer » : il garde « Copier le lien de paiement »', async () => {
    etat.lease = bail(GESTION, { tenant: { id: 1, user_id: 114, first_name: 'Fatou', last_name: 'Wade', phone: null } });
    monter(ADMIN);
    await userEvent.setup().click(screen.getAllByRole('button', { name: /Autres gestes pour/ })[0]!);
    expect(await screen.findByTestId('lien-de-paiement')).toBeInTheDocument();
    expect(screen.queryByTestId('relancer-l-echeance')).toBeNull();
  });
});
