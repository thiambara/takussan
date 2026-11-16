/**
 * TCK-2912 — le dossier du bail (maquette `app-baux` a-1, téléphone ET bureau) : la ligne
 * « Interventions (3) · 1 en cours · Rideau métallique » vers la liste filtrée du bail, « préavis 3 mois »
 * et « révision possible le 1 juil. 2027 » à la carte Durée, Appeler / WhatsApp de l'agent responsable,
 * les comptes des onglets, « Encaisser 1 422 750 F ».
 *
 * Mêmes doublures que `LeaseDetail.fiche.tck-2645` (la fiche entière, ses sections voisines simulées).
 */
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { LeaseAbilities, LeasePayment } from '@/types/lease';
import { LeaseDetail } from '../LeaseDetail';

const etat = vi.hoisted(() => ({
  lease: {} as Record<string, unknown>,
  paiements: [] as unknown[] | undefined,
  fournisseurs: [] as string[],
  params: new URLSearchParams(),
  user: { id: 9, roles: ['customer'] as string[] },
  garants: [] as unknown[],
}));
const revision = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const generer = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const remplacer = vi.hoisted(() => vi.fn());
const toastAdd = vi.hoisted(() => vi.fn());
// TCK-2780 — les options avec lesquelles la fiche lit son bail.
const optionsDeLecture = vi.hoisted(() => [] as unknown[]);

vi.mock('@/lib/queries/leases', () => ({
  useLease: (_id: unknown, options?: unknown) => {
    optionsDeLecture.push(options);
    return { data: { data: etat.lease }, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useLeasePayments: () => ({ data: etat.paiements ? { data: etat.paiements } : undefined }),
  useGenerateSchedule: () => generer,
  useReviewLeaseRent: () => revision,
  useLeaseGuarantors: () => ({ data: { data: etat.garants } }),
}));
vi.mock('@/lib/queries/documents', () => ({ useDocumentsGeneres: () => ({ data: { data: [] } }) }));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: etat.fournisseurs, isLoading: false }) }));
vi.mock('@/hooks/useVueDansLUrl', () => ({ useVueDansLUrl: () => ({ params: etat.params, remplacer }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: etat.user, token: 'jeton-du-lecteur' }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));

// Les sections voisines ont leurs propres tests : ici, ce que la fiche leur passe.
vi.mock('../LeaseSchedule', async (importOriginal) => ({
  ordreDeLEcheancier: (await importOriginal<typeof import('../LeaseSchedule')>()).ordreDeLEcheancier,
  LeaseSchedule: ({ locataire, canRecordPayment, toutes }: { locataire?: boolean; canRecordPayment?: boolean; toutes?: boolean }) => (
    <>
      <p>{`échéancier : ${locataire ? 'locataire' : 'gestion'}${canRecordPayment ? ', encaissement' : ''}`}</p>
      <p data-testid="echeancier-toutes">{String(toutes)}</p>
    </>
  ),
}));
vi.mock('../LeaseSignaturePanel', () => ({ LeaseSignaturePanel: () => null }));
vi.mock('../LeaseChainTimeline', () => ({ LeaseChainTimeline: () => null }));
vi.mock('../fiche/FeuilleDesGarants', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fiche/FeuilleDesGarants')>()),
  FeuilleDesGarants: ({ surLAjout, peutGerer, garants }: { surLAjout?: boolean; peutGerer: boolean; garants: readonly unknown[] }) => (
    <p>{`feuille des garants : ${surLAjout ? 'ajout' : 'liste'}, ${garants.length}${peutGerer ? ', gestion' : ''}`}</p>
  ),
}));
vi.mock('../DepositRefundBanner', () => ({
  DepositRefundBanner: ({ canRefund, ouvert }: { canRefund: boolean; ouvert?: boolean }) => (
    <p>{`restitution ${canRefund ? 'offerte' : 'fermée'}${ouvert ? ', dialogue ouvert' : ''}`}</p>
  ),
}));
vi.mock('../EarlyTerminationBanner', () => ({
  EarlyTerminationBanner: ({ canCancel, locataire }: { canCancel?: boolean; locataire?: boolean }) => (
    <p>{`bannière préavis : ${canCancel ? 'annulable' : 'sans annulation'}, ${locataire ? 'locataire' : 'équipe'}`}</p>
  ),
}));
vi.mock('../LeasePaymentDialog', () => ({
  LeasePaymentDialog: ({ open, paiementInitial }: { open: boolean; paiementInitial?: number }) =>
    open ? <p>{`paiement reçu, échéance ${paiementInitial ?? 'à choisir'}`}</p> : null,
}));
vi.mock('../LeaseRenewalDialog', () => ({ LeaseRenewalDialog: ({ open }: { open: boolean }) => (open ? <p>dialogue de renouvellement</p> : null) }));
vi.mock('../fiche/AbandonnerLeBrouillon', () => ({
  AbandonnerLeBrouillon: ({ open }: { open: boolean }) => (open ? <p>dialogue d’abandon</p> : null),
}));
vi.mock('../EarlyTerminationDialog', () => ({ EarlyTerminationDialog: ({ open }: { open: boolean }) => (open ? <p>dialogue de préavis</p> : null) }));
vi.mock('@/components/documents/DocumentUploadDialog', () => ({
  DocumentUploadDialog: ({ open }: { open: boolean }) => (open ? <p>dialogue de dépôt</p> : null),
}));
// Le « ⋯ » de l'en-tête du téléphone : la coque rend `actions` dans sa feuille, sous SES messages (pas ceux
// des baux) — comme FicheDuClient.tck-2589.
vi.mock('@/components/layout/en-tete-de-la-coque', async () => {
  const { FeuilleDuBas } = await import('@/components/ui/feuille-du-bas');
  const { NextIntlClientProvider } = await import('next-intl');
  const table = (await import('@/i18n/namespaces.json')).default as { frontieres: Record<string, string[]> };
  const messages = (await import('@/messages/fr.json')).default as Record<string, unknown>;
  const espaces = ['.', '(dashboard)', '(dashboard)/app'].flatMap((f) => table.frontieres[f] ?? []);
  const deLaCoque = Object.fromEntries(espaces.filter((e) => e in messages).map((e) => [e, messages[e]]));
  return {
    DeclarerEnTete: ({ actions }: { actions?: ReactNode }) =>
      actions ? (
        <NextIntlClientProvider locale="fr" messages={deLaCoque} onError={(e) => { throw e; }}>
          <FeuilleDuBas titre="Plus d’actions" declencheur={<button type="button">⋯ de l’en-tête</button>}>{actions}</FeuilleDuBas>
        </NextIntlClientProvider>
      ) : null,
  };
});
vi.mock('@/components/reviews/LeaveReviewCta', () => ({ LeaveReviewCta: () => <p>appel à l’avis</p> }));
vi.mock('../fiche/OngletsDuBail', () => ({
  OngletDocumentsDuBail: () => <p>onglet documents</p>,
  OngletHistoriqueDuBail: () => <p>onglet historique</p>,
}));
vi.mock('@/components/payments/PayOnlineButton', () => ({
  PayOnlineButton: ({ paymentId }: { paymentId: number }) => <button type="button">{`payer l’échéance ${paymentId}`}</button>,
}));

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
const GESTION: LeaseAbilities = { ...RIEN, renew: true, review_rent: true, record_payment: true, refund_deposit: true, request_early_termination: true, update: true, attach_guarantor: true, add_document: true, download_contract: true };

/** Le premier jour du mois dans `n` mois, à Dakar (UTC). */
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
    amount_due: 0,
    remaining_amount: 640000,
    currency: 'XOF',
    paid_at: null,
    receipt_available: false,
    is_overdue: false,
    late_fee_outstanding: 0,
    ...partiel,
  } as LeasePayment;
}

function bail(abilities: LeaseAbilities | undefined, partiel: Record<string, unknown> = {}) {
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
    early_termination_penalty_months: 2,
    rent_review_cap_pct: 5,
    renewed_from_lease_id: null,
    tenant: { id: 1, user_id: 114, first_name: 'Fatou', last_name: 'Wade', phone: '+221770000001' },
    landlord: { id: 40, first_name: 'Sokhna', last_name: 'Sene', full_name: 'Sokhna Sene' },
    property: { id: 12, title: 'Villa Ngor', slug: 'villa-ngor', main_photo_url: null },
    abilities,
    ...partiel,
  };
}

const monter = (historique = false) => render(withIntl(<LeaseDetail leaseId={4} historique={historique} />));
const barre = () => document.querySelector<HTMLElement>('[data-slot="barre-d-action"]');

beforeEach(() => {
  etat.lease = bail(GESTION);
  etat.paiements = [];
  etat.fournisseurs = [];
  etat.params = new URLSearchParams();
  etat.user = { id: 9, roles: ['agent'] };
  etat.garants = [];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AC1 — la ligne « Interventions » du dossier', () => {
  it('3 interventions dont 1 en cours : « Interventions (3) », « 1 en cours · Rideau métallique », vers la liste filtrée du bail', () => {
    etat.lease = bail(GESTION, { maintenance_summary: { total: 3, open: 1, latest_open: { id: 51, title: 'Rideau métallique', status: 'quote_pending' } } });
    monter();
    // Le dossier est rendu deux fois (téléphone `xl:hidden`, bureau `max-xl:hidden`) : la ligne est dans les DEUX.
    const lignes = screen.getAllByRole('link', { name: /Interventions \(3\)/ });
    expect(lignes).toHaveLength(2);
    for (const ligne of lignes) {
      expect(ligne).toHaveTextContent('1 en cours · Rideau métallique');
      expect(ligne.getAttribute('href')).toBe('/app/maintenance?filter[lease_id]=4');
      // Ni `md:hidden` ni `xl:hidden` : la maquette la montre à 390 ET à 1440.
      expect(ligne.className).not.toMatch(/hidden/);
    }
  });

  it('aucune intervention (`total: 0`) : pas de ligne', () => {
    etat.lease = bail(GESTION, { maintenance_summary: { total: 0, open: 0, latest_open: null } });
    monter();
    expect(screen.queryByText(/Interventions \(/)).toBeNull();
  });

  it('des interventions toutes closes : « Aucune en cours », sans titre', () => {
    etat.lease = bail(GESTION, { maintenance_summary: { total: 2, open: 0, latest_open: null } });
    monter();
    expect(screen.getAllByRole('link', { name: /Interventions \(2\)/ })[0]).toHaveTextContent(fr.lease.fiche.dossier.interventionsAucuneEnCours);
  });
});

describe('AC2 — préavis et révision à la carte « Durée »', () => {
  it('« préavis 3 mois » pour 90 jours, « révision possible le 1 juil. 2027 »', () => {
    etat.lease = bail(GESTION, { notice_period_days: 90, early_termination_penalty_months: 0, next_revision_date: '2027-07-01' });
    monter();
    expect(screen.getByTestId('carte-duree')).toHaveTextContent('Durée · préavis 3 mois');
    expect(screen.getByTestId('suivi-de-la-duree')).toHaveTextContent(/mois sur 36 · révision possible le 1 juil\. 2027/);
  });

  it('un préavis qui n’est pas un nombre de mois se dit en jours ; une révision passée est « possible depuis »', () => {
    etat.lease = bail(GESTION, { notice_period_days: 45, next_revision_date: '2026-10-01' });
    monter();
    expect(screen.getByTestId('carte-duree')).toHaveTextContent('Durée · préavis 45 jours · indemnité de départ : 2 mois');
    expect(screen.getByTestId('suivi-de-la-duree')).toHaveTextContent('révision possible depuis le 1 oct. 2026');
  });

  it('sans date servie, rien de la révision', () => {
    etat.lease = bail(GESTION, { next_revision_date: null });
    monter();
    expect(screen.getByTestId('carte-duree')).not.toHaveTextContent(/révision/);
  });
});

describe('AC3 — l’agent responsable joignable', () => {
  it('« Appeler » (`tel:`) et « WhatsApp » quand `agent.phone` est servi', () => {
    etat.lease = bail(GESTION, { agent: { id: 7, first_name: 'Moussa', last_name: 'Diallo', full_name: 'Moussa Diallo', phone: '+221771234567' } });
    monter();
    const partie = screen.getByTestId('partie-agent');
    expect(partie).toHaveTextContent(fr.lease.fiche.parties.agentResponsable);
    expect(within(partie).getByRole('link', { name: 'Appeler Moussa Diallo' }).getAttribute('href')).toMatch(/^tel:\+?221771234567$/);
    expect(within(partie).getByRole('link', { name: 'Écrire à Moussa Diallo sur WhatsApp' }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/221771234567/);
  });

  it('sans numéro servi : ni Appeler ni WhatsApp', () => {
    etat.lease = bail(GESTION, { agent: { id: 7, first_name: 'Moussa', last_name: 'Diallo', full_name: 'Moussa Diallo' } });
    monter();
    expect(within(screen.getByTestId('partie-agent')).queryAllByRole('link')).toHaveLength(0);
  });
});

describe('AC4 — les comptes des onglets', () => {
  it('« Documents (6) » et « Historique (14) » depuis `documents_count` / `history_count`', () => {
    etat.lease = bail(GESTION, { documents_count: 6, history_count: 14 });
    monter(true);
    expect(screen.getByRole('tab', { name: 'Documents (6)' })).toHaveTextContent('Documents6');
    expect(screen.getByRole('tab', { name: 'Historique (14)' })).toBeInTheDocument();
  });

  it('sans compte servi, l’onglet garde son nom seul', () => {
    monter(true);
    expect(screen.getByRole('tab', { name: 'Documents' })).toBeInTheDocument();
  });
});

describe('AC5 — « Encaisser » nomme le montant dû', () => {
  it('loyer restant 1 355 000 + pénalité 67 750 : « Encaisser 1 422 750 F » dans la barre collée', () => {
    etat.lease = bail(GESTION, { monthly_rent: 1_355_000 });
    etat.paiements = [
      echeance({ id: 29, status: 'late', is_overdue: true, due_date: '2026-11-05', period_start: '2026-11-01', remaining_amount: 1_355_000, late_fee_outstanding: 67_750 }),
    ];
    monter();
    expect(within(barre()!).getByTestId('geste-principal')).toHaveTextContent(/^Encaisser 1\s422\s750\sF$/);
  });

  it('sans échéance à encaisser : « Encaisser » seul', () => {
    monter();
    expect(within(barre()!).getByTestId('geste-principal')).toHaveTextContent(/^Encaisser$/);
  });
});
