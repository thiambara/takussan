/**
 * TCK-2645 — la fiche d'un bail, « dossier du bail » : un geste principal par état et par lecteur,
 * la feuille « Gestes », la révision en feuille (plus de `window.prompt`), le contrat offert à toute
 * partie qui a `download_contract`, et rien avant les capacités.
 *
 * Reprend les garanties des tests de l'ancienne fiche (P152.02 capacités, P189.03 préavis, P201.02
 * appel à l'avis, P210.01 révision refusée, P228.01 échéancier, TCK-593 contrat, TCK-1833 retards),
 * réécrites sur la fiche du ticket : aucun geste ne lit `user.roles` — chaque cas monte un compte dont
 * les RÔLES contredisent les capacités, pour que la règle soit prouvée et non supposée.
 */
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ApiError } from '@/lib/api';
import { origineApi } from '@/lib/config-publique';
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

vi.mock('@/lib/queries/leases', () => ({
  useLease: () => ({ data: { data: etat.lease }, isLoading: false, isError: false, refetch: vi.fn() }),
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
const GESTION: LeaseAbilities = { ...RIEN, renew: true, review_rent: true, record_payment: true, refund_deposit: true, request_early_termination: true, update: true, add_document: true, download_contract: true };
const LOCATAIRE: LeaseAbilities = { ...RIEN, request_early_termination: true, add_document: true, download_contract: true, leave_review: true, give_notice: true };

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
const carteActions = () => screen.queryByTestId('carte-actions');
const ouvrirLesGestes = () => fireEvent.click(within(barre()!).getByRole('button', { name: fr.lease.fiche.gestes.plus }));

beforeEach(() => {
  etat.lease = bail(GESTION);
  etat.paiements = [];
  etat.fournisseurs = [];
  etat.params = new URLSearchParams();
  etat.user = { id: 9, roles: ['customer'] };
  etat.garants = [];
  revision.mutateAsync.mockReset();
  generer.mutate.mockReset();
  remplacer.mockReset();
  toastAdd.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AC3 — rien avant les capacités, et jamais par les rôles', () => {
  it.each([['super_admin'], ['customer'], ['agent']])('sans `abilities` (compte « %s ») : ni geste, ni préavis, ni avis, ni barre', (role) => {
    etat.user = { id: 9, roles: [role] };
    etat.lease = bail(undefined);
    monter();
    expect(screen.queryByText(fr.lease.fiche.gestes.preavis)).toBeNull();
    expect(screen.queryByText('appel à l’avis')).toBeNull();
    expect(screen.queryByText(fr.lease.fiche.gestes.encaisser)).toBeNull();
    expect(barre()).toBeNull();
    expect(carteActions()).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(fr.lease.fiche.gestes.contratPdf) })).toBeNull();
  });

  it('un compte « customer » qui gère le bail a les gestes de gestion', () => {
    etat.user = { id: 9, roles: ['customer'] };
    monter();
    expect(within(barre()!).getByText(fr.lease.fiche.gestes.encaisser)).toBeInTheDocument();
  });
});

describe('le geste principal', () => {
  it('gestion, bail actif : « Encaisser » ouvre le paiement reçu sur l’échéance en retard', () => {
    etat.paiements = [echeance({ id: 9, status: 'paid' }), echeance({ id: 29, status: 'late', is_overdue: true, due_date: debutDeMois(-1) })];
    monter();
    fireEvent.click(within(barre()!).getByText(fr.lease.fiche.gestes.encaisser));
    expect(screen.getByText('paiement reçu, échéance 29')).toBeInTheDocument();
  });

  it('en signature, la gestion relance par WhatsApp la partie qui n’a pas signé (décision 4)', () => {
    etat.lease = bail(GESTION, { status: 'pending_signature', can_request_signature: true, can_sign_as: [], signatures: [] });
    monter();
    const lien = within(barre()!).getByRole('link', { name: new RegExp(fr.lease.fiche.gestes.relancerSignature) });
    expect(lien.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/221770000001\?text=/);
    expect(decodeURIComponent(lien.getAttribute('href')!)).toContain('Bonjour Fatou, le bail LS-4 attend votre signature');
  });

  it('brouillon, locataire sans compte : « Envoyer à la signature » désactivé, avec sa raison', () => {
    etat.lease = bail(GESTION, { status: 'draft', can_request_signature: true, tenant: { id: 1, user_id: null, first_name: 'Fatou' } });
    monter();
    expect(within(barre()!).getByRole('button', { name: new RegExp(fr.lease.fiche.gestes.envoyerSignature) })).toBeDisabled();
    expect(screen.getByTestId('signature-bloquee')).toHaveTextContent(fr.lease.fiche.gestes.bloque['sans-compte']);
  });

  it('locataire avec une échéance due et le paiement en ligne : « Payer » cette échéance', () => {
    etat.lease = bail(LOCATAIRE);
    etat.fournisseurs = ['wave'];
    etat.paiements = [echeance({ id: 29, amount_due: 672000, is_overdue: true, status: 'late' })];
    monter();
    expect(within(barre()!).getByRole('button', { name: 'payer l’échéance 29' })).toBeInTheDocument();
  });

  it('locataire sans paiement en ligne : « À régler auprès de votre agence » et « Télécharger mon contrat » (décision 14)', () => {
    etat.lease = bail(LOCATAIRE);
    etat.paiements = [echeance({ id: 29, amount_due: 672000 })];
    monter();
    expect(within(screen.getByTestId('carte-loyer')).getByText(fr.lease.fiche.loyer.aRegler)).toBeInTheDocument();
    expect(within(barre()!).getByRole('button', { name: new RegExp(fr.lease.fiche.gestes.contrat) })).toBeInTheDocument();
  });
});

describe('la feuille « Gestes » et la carte « Actions »', () => {
  it('l’ordre du ticket, la résiliation en dernier ; « Générer l’échéancier » absent quand il existe (AC4)', () => {
    etat.paiements = [echeance({ id: 1 })];
    monter();
    ouvrirLesGestes();
    const feuille = screen.getByTestId('feuille-gestes');
    const libelles = within(feuille).getAllByRole('button').map((b) => b.textContent);
    expect(libelles).toEqual([fr.lease.fiche.gestes.reviser, fr.lease.fiche.gestes.renouveler, fr.lease.fiche.gestes.document, fr.lease.fiche.gestes.resilier]);
    expect(screen.queryByText(fr.lease.fiche.gestes.generer)).toBeNull();
  });

  it('« Générer l’échéancier » quand seule la caution existe ; son refus se dit (P228.01)', () => {
    etat.paiements = [echeance({ id: 1, payment_type: 'deposit' })];
    generer.mutate.mockImplementation((_: unknown, { onError }: { onError: (e: unknown) => void }) =>
      onError(new ApiError(422, { message: 'Le bail n’est pas actif.' })),
    );
    monter();
    ouvrirLesGestes();
    fireEvent.click(within(screen.getByTestId('feuille-gestes')).getByText(fr.lease.fiche.gestes.generer));
    expect(generer.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Le bail n’est pas actif.');
  });

  it('un succès après un refus efface le message (P228.01)', () => {
    etat.paiements = [echeance({ id: 1, payment_type: 'deposit' })];
    generer.mutate
      .mockImplementationOnce((_: unknown, { onError }: { onError: (e: unknown) => void }) => onError(new ApiError(422, { message: 'Refusé.' })))
      .mockImplementationOnce(() => undefined);
    monter();
    ouvrirLesGestes();
    fireEvent.click(within(screen.getByTestId('feuille-gestes')).getByText(fr.lease.fiche.gestes.generer));
    expect(screen.getByRole('alert')).toHaveTextContent('Refusé.');
    ouvrirLesGestes();
    fireEvent.click(within(screen.getByTestId('feuille-gestes')).getByText(fr.lease.fiche.gestes.generer));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('chaque geste suit son drapeau : rien de ce que l’API refuse (P152.02)', () => {
    etat.lease = bail({ ...RIEN, renew: true });
    monter();
    ouvrirLesGestes();
    const feuille = screen.getByTestId('feuille-gestes');
    expect(within(feuille).getAllByRole('button').map((b) => b.textContent)).toEqual([fr.lease.fiche.gestes.renouveler]);
    fireEvent.click(within(feuille).getByText(fr.lease.fiche.gestes.renouveler));
    expect(screen.getByText('dialogue de renouvellement')).toBeInTheDocument();
  });

  it('le garant et la bannière suivent `update` et `request_early_termination` (P189.03)', () => {
    etat.lease = bail({ ...RIEN, review_rent: true });
    monter();
    expect(screen.queryByText(fr.lease.guarantor.add)).toBeNull();
    expect(screen.getByText('bannière préavis : sans annulation, équipe')).toBeInTheDocument();
  });
});

describe('AC6 — le locataire : « Mon bail », le préavis dans « ⋯ »', () => {
  beforeEach(() => {
    etat.lease = bail(LOCATAIRE);
    etat.user = { id: 114, roles: ['agent'] };
  });

  it('s’intitule « Mon bail », et le préavis n’est pas un bouton du premier écran', () => {
    monter();
    expect(screen.getAllByText(fr.lease.fiche.monBail).length).toBeGreaterThan(0);
    const horsActions = screen.queryAllByRole('button', { name: fr.lease.fiche.gestes.preavis }).filter((b) => !carteActions()?.contains(b));
    expect(horsActions).toHaveLength(0);
  });

  it('dans « ⋯ », le préavis est précédé de son délai et de son indemnité, et ouvre son dialogue', () => {
    monter();
    ouvrirLesGestes();
    const feuille = screen.getByTestId('feuille-gestes');
    const conditions = within(feuille).getByTestId('conditions-du-preavis');
    expect(conditions).toHaveTextContent('Préavis de 90 jours · Indemnité de 2 mois de loyer');
    const bouton = within(feuille).getByRole('button', { name: fr.lease.fiche.gestes.preavis });
    expect(conditions.compareDocumentPosition(bouton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(bouton);
    expect(screen.getByText('dialogue de préavis')).toBeInTheDocument();
  });

  it('la bannière de résiliation mène le locataire à ses paiements, et l’avis lui est offert (P201.02)', () => {
    monter();
    expect(screen.getByText('bannière préavis : annulable, locataire')).toBeInTheDocument();
    expect(screen.getByText('appel à l’avis')).toBeInTheDocument();
    expect(screen.getByText('échéancier : locataire')).toBeInTheDocument();
  });

  it('la gestion n’a pas l’appel à l’avis (`leave_review` faux)', () => {
    etat.lease = bail(GESTION);
    monter();
    expect(screen.queryByText('appel à l’avis')).toBeNull();
  });
});

describe('AC1 — le contrat PDF à toute partie qui a `download_contract`', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
  });

  it('le bailleur du bail 80 : « Contrat PDF » télécharge depuis l’API avec le Bearer', async () => {
    etat.lease = bail({ ...RIEN, download_contract: true }, { id: 80, reference_number: 'LS-80' });
    etat.user = { id: 8, roles: ['customer'] };
    fetchMock.mockResolvedValue(new Response(new Blob(['%PDF']), { status: 200 }));
    monter();
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(fr.lease.fiche.gestes.contratPdf) })[0]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${origineApi()}/api/leases/80/contract/pdf`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jeton-du-lecteur');
  });

  it('sans `download_contract`, aucun contrat offert', () => {
    etat.lease = bail({ ...GESTION, download_contract: false });
    monter();
    expect(screen.queryByRole('button', { name: new RegExp(fr.lease.fiche.gestes.contratPdf) })).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(fr.lease.fiche.dossier.contrat) })).toBeNull();
  });
});

describe('AC2 — « Réviser le loyer » en feuille, plus de `window.prompt`', () => {
  const effet = debutDeMois(2);
  beforeEach(() => {
    etat.paiements = [echeance({ id: 31, period_start: effet, due_date: effet })];
  });

  async function reviser(montant: string) {
    const user = userEvent.setup();
    monter();
    ouvrirLesGestes();
    await user.click(within(screen.getByTestId('feuille-gestes')).getByText(fr.lease.fiche.gestes.reviser));
    const feuille = await screen.findByTestId('feuille-de-revision');
    await user.type(within(feuille).getByLabelText(fr.lease.fiche.revision.nouveau), montant);
    await user.click(within(feuille).getByRole('button', { name: fr.lease.fiche.revision.motifs.indexation }));
    return { user, feuille };
  }

  it('envoie `{new_rent, reason, effective_date}` au début de la prochaine période, puis le dit', async () => {
    const prompt = vi.spyOn(window, 'prompt');
    revision.mutateAsync.mockResolvedValue({ data: {} });
    const { user } = await reviser('660000');
    await user.click(screen.getByRole('button', { name: fr.lease.fiche.revision.proposer }));
    expect(revision.mutateAsync).toHaveBeenCalledWith({ new_rent: 660000, reason: 'Indexation', effective_date: effet });
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ title: fr.lease.fiche.revision.toast.titre, type: 'success' }));
    expect(prompt).not.toHaveBeenCalled();
  });

  it('maquette a-4 : le motif retenu est un choix coché, les autres non (lot 3)', async () => {
    const { feuille } = await reviser('660000');
    const retenu = within(feuille).getByRole('button', { name: fr.lease.fiche.revision.motifs.indexation });
    expect(retenu.getAttribute('aria-pressed')).toBe('true');
    expect(retenu.querySelector('svg.lucide-check')).not.toBeNull();
    expect(within(feuille).getByRole('button', { name: fr.lease.fiche.revision.motifs.travaux }).querySelector('svg.lucide-check')).toBeNull();
  });

  it('le refus du plafond figé au contrat se pose sous le champ montant', async () => {
    const message = 'Le contrat signé plafonne la révision du loyer à 5 % : ce plafond ne se force pas.';
    revision.mutateAsync.mockRejectedValue(new ApiError(422, { code: 'lease.rent_review_above_contract_cap', message }));
    const { user, feuille } = await reviser('660000');
    await user.click(screen.getByRole('button', { name: fr.lease.fiche.revision.proposer }));
    const champ = within(feuille).getByTestId('champ-nouveau-loyer');
    expect(await within(champ).findByRole('alert')).toHaveTextContent(message);
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it('au-delà du plafond, sans `rent_review_force` : ni case « passer outre », ni envoi', async () => {
    const { feuille } = await reviser('700000');
    expect(within(feuille).getByText(fr.lease.fiche.revision.auDela)).toBeInTheDocument();
    expect(within(feuille).queryByText(fr.lease.fiche.revision.forcer)).toBeNull();
    expect(screen.getByRole('button', { name: fr.lease.fiche.revision.proposer })).toBeDisabled();
  });

  it('au-delà du plafond, avec `rent_review_force` : « passer outre » coché part avec `force`', async () => {
    etat.lease = bail({ ...GESTION, rent_review_force: true });
    revision.mutateAsync.mockResolvedValue({ data: {} });
    const { user, feuille } = await reviser('700000');
    await user.click(within(feuille).getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: fr.lease.fiche.revision.proposer }));
    expect(revision.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ new_rent: 700000, force: true }));
  });

  it('« prévenus » ne se promet qu’à qui l’API prévient (décision 9)', async () => {
    etat.lease = bail(GESTION, { tenant: { id: 1, user_id: null, first_name: 'Fatou', last_name: 'Wade' } });
    etat.user = { id: 40, roles: ['agent'] };
    const { feuille } = await reviser('650000');
    expect(within(feuille).getByTestId('revision-prevenus')).toHaveTextContent(fr.lease.fiche.revision.prevenus.personne);
  });

  it('`?geste=reviser` ouvre la feuille au lecteur qui a le geste, jamais à un autre', () => {
    etat.params = new URLSearchParams('geste=reviser');
    etat.lease = bail({ ...GESTION, review_rent: false });
    monter();
    expect(screen.queryByTestId('feuille-de-revision')).toBeNull();
  });
});

describe('l’en-tête et les onglets', () => {
  it('« Bail de Fatou Wade », l’alerte des retards comptée sur ce que l’API dit échu (TCK-1833)', () => {
    etat.paiements = [
      echeance({ id: 1, is_overdue: true, status: 'late', due_date: debutDeMois(-1) }),
      echeance({ id: 2, payment_type: 'deposit_refund', is_overdue: false }),
      echeance({ id: 3 }),
    ];
    monter();
    expect(screen.getAllByText('Bail de Fatou Wade').length).toBeGreaterThan(0);
    // Maquette a-1 : aucune pastille de retard dans l'en-tête ; le compte vit à la ligne « Échéancier » du dossier.
    expect(screen.queryByText('1 en retard')).toBeNull();
    for (const dossier of screen.getAllByTestId('dossier-du-bail')) expect(dossier.textContent).toContain('1 en retard');
  });

  it('maquette a-1 : « Les n échéances » est l’action de la carte, et le titre suit ce qu’elle montre (lot 3)', () => {
    etat.paiements = Array.from({ length: 8 }, (_, i) => echeance({ id: 100 + i, period_start: debutDeMois(i), due_date: debutDeMois(i) }));
    monter();
    const carte = document.getElementById('echeancier')!;
    expect(within(carte).getByRole('heading', { level: 2 }).textContent).toBe('Échéancier — les 6 prochaines échéances');
    // Au téléphone, « Échéancier » seul à côté de l'action : la suite ne se lit qu'à partir de `md`.
    expect(within(carte).getByRole('heading', { level: 2 }).querySelector('.max-md\\:hidden')?.textContent).toBe(' — les 6 prochaines échéances');
    const action = within(carte).getByRole('button', { name: 'Les 8 échéances' });
    expect(action.getAttribute('aria-expanded')).toBe('false');
    expect(within(carte).getByTestId('echeancier-toutes').textContent).toBe('false');
    fireEvent.click(action);
    expect(within(carte).getByRole('heading', { level: 2 }).textContent).toBe('Échéancier');
    expect(within(carte).getByRole('button', { name: 'Les prochaines seulement' }).getAttribute('aria-expanded')).toBe('true');
    expect(within(carte).getByTestId('echeancier-toutes').textContent).toBe('true');
  });

  it('TCK-2644 — `?echeancier=toutes` (« Relancer » d’une pénalité, depuis la file) : l’échéancier s’ouvre déplié et la page s’y porte', () => {
    etat.paiements = Array.from({ length: 8 }, (_, i) => echeance({ id: 100 + i, period_start: debutDeMois(i), due_date: debutDeMois(i) }));
    etat.params = new URLSearchParams('echeancier=toutes');
    const porte = vi.fn();
    const avant = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      porte(this.id);
    };
    try {
      monter();
    } finally {
      Element.prototype.scrollIntoView = avant;
    }
    const carte = document.getElementById('echeancier')!;
    expect(within(carte).getByTestId('echeancier-toutes').textContent).toBe('true');
    expect(within(carte).getByRole('button', { name: 'Les prochaines seulement' }).getAttribute('aria-expanded')).toBe('true');
    expect(porte).toHaveBeenCalledWith('echeancier');
  });

  it('six échéances ou moins : ni action à la carte, ni « prochaines » dans le titre', () => {
    etat.paiements = [echeance({ id: 1 }), echeance({ id: 2, period_start: debutDeMois(2), due_date: debutDeMois(2) })];
    monter();
    const carte = document.getElementById('echeancier')!;
    expect(within(carte).getByRole('heading', { level: 2 }).textContent).toBe('Échéancier');
    expect(within(carte).queryByRole('button', { name: /échéances|prochaines/ })).toBeNull();
  });

  it('maquette a-1 : le type court (« Habitation »), le bien lié avec son chevron au téléphone', () => {
    monter();
    expect(screen.getAllByText('Habitation').length).toBe(2);
    expect(screen.queryByText('Bail d’habitation')).toBeNull();
    const lien = screen.getByTestId('bien-du-bail-telephone');
    expect(lien.getAttribute('href')).toBe('/app/properties/12');
    expect(lien.querySelector('svg')).not.toBeNull();
  });

  it('au téléphone, « Ajouter un document » au « ⋯ » de l’en-tête, seulement avec add_document', () => {
    monter();
    fireEvent.click(screen.getByRole('button', { name: '⋯ de l’en-tête' }));
    fireEvent.click(screen.getByRole('button', { name: fr.lease.fiche.gestes.document }));
    expect(screen.getByText('dialogue de dépôt')).toBeTruthy();
  });

  it('sans add_document, l’en-tête du téléphone n’a pas de « ⋯ »', () => {
    etat.lease = bail({ ...GESTION, add_document: false });
    monter();
    expect(screen.queryByRole('button', { name: '⋯ de l’en-tête' })).toBeNull();
  });

  it('maquette a-1 : bail actif, aucun bloc vide avant « Parties » (l’ancre de signature n’existe qu’avant l’activation)', () => {
    monter();
    expect(document.getElementById('signature')).toBeNull();
    etat.lease = bail(GESTION, { status: 'pending_signature' });
    monter();
    expect(document.getElementById('signature')).not.toBeNull();
  });

  it('maquette a-1 : l’agent responsable dans « Parties » au bureau, pas au téléphone', () => {
    etat.lease = bail(GESTION, { agent: { id: 7, first_name: 'Khady', last_name: 'Diallo', full_name: 'Khady Diallo' } });
    monter();
    expect(screen.getByTestId('partie-agent').className).toContain('max-md:hidden');
    expect(screen.getByTestId('partie-locataire').className).not.toContain('max-md:hidden');
  });

  it('« Historique » seulement au lecteur à qui la piste d’audit s’ouvre (décision 11)', () => {
    monter(false);
    expect(screen.queryByRole('tab', { name: fr.lease.fiche.onglets.historique })).toBeNull();
    etat.params = new URLSearchParams('onglet=historique');
    monter(false);
    expect(screen.queryByText('onglet historique')).toBeNull();
  });

  it('l’onglet « Historique » se lit quand il est ouvert', () => {
    etat.params = new URLSearchParams('onglet=historique');
    monter(true);
    expect(screen.getByRole('tab', { name: fr.lease.fiche.onglets.historique })).toBeInTheDocument();
    expect(screen.getByText('onglet historique')).toBeInTheDocument();
  });
});

describe('TCK-2764 (AC9) — « Abandonner le brouillon »', () => {
  const BROUILLON: LeaseAbilities = { ...GESTION, abandon: true };

  it('sur un brouillon, l’action est offerte en fin de carte et ouvre son dialogue', () => {
    etat.lease = bail(BROUILLON, { status: 'draft' });
    monter();

    // En ton destructif, dernier et séparé comme la résiliation.
    const action = within(carteActions()!).getByRole('button', { name: fr.lease.fiche.gestes.abandonner });
    expect(action).toHaveClass('text-destructive');
    expect(within(carteActions()!).getAllByRole('button').at(-1)).toBe(action);
    fireEvent.click(action);
    expect(screen.getByText('dialogue d’abandon')).toBeInTheDocument();
    expect(screen.queryByTestId('abandon-empeche')).not.toBeInTheDocument();
  });

  it('avec une caution saisie, l’action cède la place à sa raison — au bureau comme dans « ⋯ »', () => {
    etat.lease = bail(BROUILLON, { status: 'draft' });
    etat.paiements = [echeance({ payment_type: 'deposit', status: 'pending' })];
    monter();

    expect(within(carteActions()!).queryByRole('button', { name: fr.lease.fiche.gestes.abandonner })).not.toBeInTheDocument();
    expect(within(carteActions()!).getByText(fr.lease.fiche.gestes.abandonEmpeche)).toBeInTheDocument();
    ouvrirLesGestes();
    expect(within(screen.getByTestId('feuille-gestes')).getByText(fr.lease.fiche.gestes.abandonEmpeche)).toBeInTheDocument();
  });

  it('avec un état des lieux, l’action cède la place à sa raison propre (r1 de la vérification d’ace044c18)', () => {
    etat.lease = bail(BROUILLON, { status: 'draft', has_inventory: true });
    monter();

    expect(within(carteActions()!).queryByRole('button', { name: fr.lease.fiche.gestes.abandonner })).not.toBeInTheDocument();
    expect(within(carteActions()!).getByText(fr.lease.fiche.gestes.abandonEmpecheEtatDesLieux)).toBeInTheDocument();
    expect(screen.queryByText(fr.lease.fiche.gestes.abandonEmpeche)).not.toBeInTheDocument();
    ouvrirLesGestes();
    expect(within(screen.getByTestId('feuille-gestes')).getByText(fr.lease.fiche.gestes.abandonEmpecheEtatDesLieux)).toBeInTheDocument();
  });

  it('hors d’un brouillon, ni l’action ni sa raison', () => {
    etat.lease = bail(BROUILLON, { status: 'pending_signature' });
    etat.paiements = [echeance({ payment_type: 'deposit', status: 'pending' })];
    monter();

    expect(screen.queryByRole('button', { name: fr.lease.fiche.gestes.abandonner })).not.toBeInTheDocument();
    expect(screen.queryByTestId('abandon-empeche')).not.toBeInTheDocument();
  });
});

describe('TCK-2762 — le garant parmi les parties (bureau) et « Garant (n) » au dossier (téléphone)', () => {
  const OUSMANE = { id: 5, first_name: 'Ousmane', last_name: 'Seck', phone: '+221770000005', email: null, role: null };
  const dossierDuTelephone = () => screen.getAllByTestId('dossier-du-bail')[0]!;
  const ligne = (el: HTMLElement) => el.closest('[data-slot="ligne-de-liste"]') as HTMLElement;

  it('un bail avec un garant : sa ligne dans « Parties » au bureau, « Garant (1) » au dossier du téléphone', () => {
    etat.garants = [OUSMANE];
    monter();

    const parties = screen.getByTestId('partie-bailleur').parentElement!;
    const dansParties = within(parties).getByText('Ousmane Seck');
    expect(ligne(dansParties).className).toContain('max-md:hidden');
    expect(within(ligne(dansParties)).getByText(fr.lease.fiche.parties.garant)).toBeInTheDocument();

    const auDossier = within(dossierDuTelephone()).getByText('Garant (1)');
    expect(ligne(auDossier).className).toContain('md:hidden');
    expect(within(ligne(auDossier)).getByText('Ousmane Seck')).toBeInTheDocument();
  });

  it('la ligne ouvre la feuille des garants, en lecture pour qui n’a pas `update`', () => {
    etat.garants = [OUSMANE];
    etat.lease = bail({ ...RIEN, download_contract: true });
    monter();

    fireEvent.click(within(dossierDuTelephone()).getByText('Garant (1)'));
    expect(screen.getByText('feuille des garants : liste, 1')).toBeInTheDocument();
  });

  it('la feuille sait que le gestionnaire peut ajouter', () => {
    etat.garants = [OUSMANE];
    monter();

    fireEvent.click(within(screen.getByTestId('partie-bailleur').parentElement!).getByText('Ousmane Seck'));
    expect(screen.getByText('feuille des garants : liste, 1, gestion')).toBeInTheDocument();
  });

  it('sans garant : aucune ligne, et l’ajout offert à qui a `update`, qui ouvre la feuille sur le formulaire', () => {
    monter();

    expect(screen.queryByText(/^Garant \(/)).toBeNull();
    // Une ligne dans « Parties » (bureau), une au dossier (téléphone).
    const dansParties = within(screen.getByTestId('partie-bailleur').parentElement!).getByText(fr.lease.guarantor.add);
    expect(ligne(dansParties).className).toContain('max-md:hidden');
    expect(ligne(within(dossierDuTelephone()).getByText(fr.lease.guarantor.add)).className).toContain('md:hidden');
    fireEvent.click(dansParties);
    expect(screen.getByText('feuille des garants : ajout, 0, gestion')).toBeInTheDocument();
  });

  it('sans garant ni `update` : rien du garant', () => {
    etat.lease = bail({ ...RIEN, download_contract: true });
    monter();

    expect(screen.queryByText(fr.lease.guarantor.add)).toBeNull();
    expect(screen.queryByText(/^Garant/)).toBeNull();
  });

  it('à qui peut le modifier, la ligne dit l’état de la pièce (« renseignée », jamais « reçue »)', () => {
    etat.garants = [{ ...OUSMANE, can_edit: true, id_on_file: true, leases_count: 1 }];
    monter();

    const dansParties = within(screen.getByTestId('partie-bailleur').parentElement!).getByText('Ousmane Seck');
    expect(within(ligne(dansParties)).getByText('Garant · pièce d’identité renseignée')).toBeInTheDocument();
    const auDossier = ligne(within(dossierDuTelephone()).getByText('Garant (1)'));
    expect(within(auDossier).getByText('Ousmane Seck · pièce d’identité renseignée')).toBeInTheDocument();
  });

  it('la carte « Garants » a quitté la fiche', () => {
    etat.garants = [OUSMANE];
    monter();

    expect(screen.queryByRole('heading', { name: fr.lease.guarantor.title })).toBeNull();
  });
});
