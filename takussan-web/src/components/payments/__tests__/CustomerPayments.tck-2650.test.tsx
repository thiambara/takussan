/**
 * TCK-2650 — la page « Paiements » du locataire lit sa tête sur `GET /api/me/rent-summary` (TCK-2649) :
 *
 *  · AC2 — `due` : « À régler » et le TOTAL servi par l'API (jamais une addition de la page), sa
 *    composition, le lieu du règlement, et « Vous êtes à jour » absent du DOM ;
 *  · `up_to_date` : « Vous êtes à jour », le prochain loyer, « Payer d'avance » ;
 *  · AC3 — `none` : la carte neutre « pas encore programmé », sans « à jour » ;
 *  · AC5 — la caution se nomme « Caution · Versée le … », jamais « Loyer du … au … » ;
 *  · l'icône de reçu ne porte aucun symbole monétaire ;
 *  · « Comment payer à l'agence » et `?moyen=agence` (le « Payer à l'agence » du retour) ouvrent les
 *    moyens que l'agence déclare.
 *
 * Les montants sont ceux de la démo `locataire-f4` (relevé du 2026-11-13) : deux pénalités de 67 750 F.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { PaymentHistoryRow, ResumeDuLoyer } from '@/types/invoice';
import { CustomerPayments, echeancesAVenir } from '../CustomerPayments';

const usePaymentsHistory = vi.fn();
const useResumeDuLoyer = vi.fn();
vi.mock('@/lib/queries/payments', () => ({
  usePaymentsHistory: (...args: unknown[]) => usePaymentsHistory(...args),
  useResumeDuLoyer: () => useResumeDuLoyer(),
}));
const mutateAsync = vi.fn();
vi.mock('@/hooks/useInitiatePayment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useInitiatePayment')>()),
  useInitiatePayment: () => ({ mutateAsync, isPending: false }),
  readProviderPreference: () => null,
  rememberProviderPreference: vi.fn(),
}));
let fournisseurs: string[] = ['wave'];
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: fournisseurs, isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
let recherche = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(recherche) }));

const texte = (s: string | null | undefined) => (s ?? '').replace(/[  ]/g, ' ');
/** Un nom accessible comparé espaces insécables ramenés à l'espace : « 1 355 000 F » s'écrit avec U+202F et U+00A0. */
const nomExact = (attendu: string) => (nom: string) => texte(nom) === attendu;

function ligne(surcharge: Partial<PaymentHistoryRow>): PaymentHistoryRow {
  return {
    source: 'lease',
    id: 1,
    reference_number: null,
    amount: 1_355_000,
    currency: 'XOF',
    payment_method: null,
    payment_type: 'rent',
    status: 'paid',
    paid_amount: 1_355_000,
    remaining_amount: 0,
    late_fee_amount: null,
    late_fee_outstanding: 0,
    late_fee_payable_online: false,
    amount_due: 0,
    date: '2026-11-01T00:00:00Z',
    paid_at: '2026-11-05T00:00:00Z',
    period_start: '2026-11-01',
    period_end: '2026-11-30',
    due_date: '2026-11-05',
    booking_id: null,
    lease_id: 9,
    property_id: 3,
    customer_id: 4,
    created_at: '2026-11-01T00:00:00Z',
    ...surcharge,
  };
}

const AGENCE = { id: 2, name: 'Dakar Immo', phone: '+221776452018' };
const BAIL = {
  id: 9,
  reference_number: 'LS-0DPA75TK',
  status: 'active',
  monthly_rent: 1_355_000,
  monthly_charges: null,
  currency: 'XOF',
  property: { id: 3, title: 'Villa 4 chambres' },
  agency: AGENCE,
};

const PENALITE = (id: number, mois: string) => ({
  kind: 'late_fee',
  lease_payment_id: id,
  lease_id: 9,
  payment_type: 'rent',
  due_date: `${mois}-05`,
  period_start: `${mois}-01`,
  period_end: `${mois}-30`,
  amount: 67_750,
  currency: 'XOF',
  days_late: null,
  payable_online: false,
});

const DU: ResumeDuLoyer = {
  currency: 'XOF',
  total_due: 135_500,
  parts: { payable_online: 0, payable_at_agency: 135_500 },
  items: [PENALITE(21, '2026-07'), PENALITE(24, '2026-10')],
  next_rent: null,
  schedule_state: 'due',
  lease: BAIL,
  offline_payment: { agency_phone: '+221776452018' },
};

const A_JOUR: ResumeDuLoyer = {
  ...DU,
  total_due: 0,
  parts: { payable_online: 0, payable_at_agency: 0 },
  items: [],
  next_rent: { lease_id: 9, lease_payment_id: 30, due_date: '2026-12-05', amount: 1_355_000, charges_amount: 0, currency: 'XOF', payable_online: true },
  schedule_state: 'up_to_date',
};

const SANS_ECHEANCE: ResumeDuLoyer = {
  ...A_JOUR,
  next_rent: null,
  schedule_state: 'none',
  lease: { ...BAIL, reference_number: 'LS-FC-MT5YXV', monthly_rent: 500_000 },
};

/** L'historique de la démo : le loyer d'octobre payé en retard, sa pénalité due, et la caution. */
const OCTOBRE = ligne({
  id: 24,
  reference_number: 'LPY-PQLJDO',
  period_start: '2026-10-01',
  period_end: '2026-10-31',
  due_date: '2026-10-05',
  paid_at: '2026-10-29T10:00:00Z',
  late_fee_amount: 67_750,
  late_fee_outstanding: 67_750,
});
const CAUTION = ligne({
  id: 5,
  payment_type: 'deposit',
  reference_number: 'LPY-0DEPOT',
  period_start: '2026-07-01',
  period_end: '2026-07-01',
  due_date: '2026-07-01',
  paid_at: '2026-07-01T09:00:00Z',
});

function reponse(data: PaymentHistoryRow[]) {
  return { data: { data, meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length } }, isLoading: false, isError: false, refetch: vi.fn() };
}

function poser(resume: ResumeDuLoyer, { dus = [], historique = [OCTOBRE, CAUTION] }: { dus?: PaymentHistoryRow[]; historique?: PaymentHistoryRow[] } = {}) {
  useResumeDuLoyer.mockReturnValue({ data: { data: resume }, isLoading: false, isError: false });
  usePaymentsHistory.mockImplementation((params: { status?: string }) => (params.status ? reponse(dus) : reponse(historique)));
}

beforeEach(() => {
  recherche = '';
  fournisseurs = ['wave'];
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ data: {} });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  usePaymentsHistory.mockReset();
  useResumeDuLoyer.mockReset();
});

const rendre = () => render(withIntl(<CustomerPayments />));

describe('TCK-2650 — la tête selon `schedule_state`', () => {
  it('AC2 — `due` : « À régler », le total servi par l’API, sa composition, à régler à l’agence ; jamais « à jour »', () => {
    poser(DU);
    const { container } = rendre();
    const tete = container.querySelector('[data-slot="tete-des-paiements"]') as HTMLElement;
    expect(tete.dataset.etat).toBe('due');
    expect(within(tete).getByText(fr.payments.locataire.tete.aRegler)).toBeInTheDocument();
    expect(texte(screen.getByTestId('total-du').textContent)).toBe('135 500 F');
    expect(texte(tete.textContent)).toContain('2 pénalités de retard (octobre et juillet), à régler à l’agence Dakar Immo.');
    expect(within(tete).getByText('Pénalité d’octobre')).toBeInTheDocument();
    expect(within(tete).getByText('Pénalité de juillet')).toBeInTheDocument();
    // Le loyer qu'elle a frappé est dans l'historique : sa date de paiement et son retard.
    expect(texte(tete.textContent)).toContain('Loyer payé le 29 oct. · 24 jours de retard');
    expect(container.textContent).not.toContain(fr.payments.locataire.tete.aJour);
    expect(container.textContent).not.toContain(fr.payments.customer.upToDate);
    // Rien ne se paie en ligne : aucun « Payer » dans la tête.
    expect(within(tete).queryByRole('button', { name: /^Payer/ })).toBeNull();
  });

  it('le total est celui de l’API, jamais la somme des lignes', () => {
    poser({ ...DU, total_due: 999_999 });
    rendre();
    expect(texte(screen.getByTestId('total-du').textContent)).toBe('999 999 F');
  });

  it('`up_to_date` : « Vous êtes à jour », le prochain loyer et « Payer d’avance »', () => {
    poser(A_JOUR);
    const { container } = rendre();
    const tete = container.querySelector('[data-slot="tete-des-paiements"]') as HTMLElement;
    expect(tete.dataset.etat).toBe('up_to_date');
    expect(within(tete).getByText(fr.payments.locataire.tete.aJour)).toBeInTheDocument();
    expect(texte(tete.textContent)).toContain('1 355 000 F');
    expect(texte(tete.textContent)).toContain('le 5 décembre · dans 25 jours');
    expect(within(tete).getByRole('button', { name: fr.payments.locataire.tete.payerDAvance })).toBeInTheDocument();
    expect(container.textContent).not.toContain(fr.payments.locataire.tete.aRegler);
  });

  it('AC3 — `none` : carte neutre, « pas encore programmé », le bail, « Contacter l’agence » ; jamais « à jour »', () => {
    poser(SANS_ECHEANCE, { historique: [] });
    const { container } = rendre();
    const tete = container.querySelector('[data-slot="tete-des-paiements"]') as HTMLElement;
    expect(tete.dataset.etat).toBe('none');
    expect(within(tete).getByRole('heading', { name: fr.payments.locataire.tete.premierLoyerPasProgramme })).toBeInTheDocument();
    expect(texte(tete.textContent)).toContain('Bail LS-FC-MT5YXV · 500 000 F / mois. Dakar Immo prépare votre échéancier');
    expect(within(tete).getByRole('link', { name: fr.payments.locataire.tete.contacterLAgence })).toHaveAttribute('href', 'tel:+221776452018');
    expect(tete.className).not.toMatch(/success/);
    expect(container.textContent).not.toContain(fr.payments.locataire.tete.aJour);
    expect(container.textContent).not.toContain(fr.payments.customer.upToDate);
  });

  it('la carte « Prochain loyer » suit une dette, avec « Payer maintenant » secondaire quand le dû se règle à l’agence', () => {
    poser({ ...DU, next_rent: A_JOUR.next_rent });
    const { container } = rendre();
    const carte = container.querySelector('[data-slot="prochain-loyer"]') as HTMLElement;
    expect(texte(carte.textContent)).toContain('Prochain loyer · dans 25 jours');
    const payer = within(carte).getByRole('button', { name: fr.payments.locataire.prochain.payerMaintenant });
    expect(payer.className).toMatch(/border/);
    expect(payer.className).not.toMatch(/bg-primary/);
  });

  it('pas de carte « Prochain loyer » quand l’échéancier est à jour (le prochain loyer est déjà en tête)', () => {
    poser(A_JOUR);
    const { container } = rendre();
    expect(container.querySelector('[data-slot="prochain-loyer"]')).toBeNull();
  });
});

describe('TCK-2650 — l’historique', () => {
  it('AC5 — la caution se nomme « Caution · Versée le … », jamais « Loyer du … au … »', () => {
    poser(DU);
    rendre();
    const cartes = within(screen.getByTestId('historique-client')).getAllByRole('listitem');
    const caution = cartes[1];
    expect(within(caution).getByText(fr.payments.locataire.historique.caution)).toBeInTheDocument();
    expect(texte(caution.textContent)).toContain('Versée le 1 juil.');
    expect(document.body.textContent).not.toMatch(/Loyer du .* au /);
    // Son justificatif est un reçu, pas une quittance de loyer.
    expect(within(caution).getByRole('button', { name: fr.payments.locataire.historique.recu })).toBeInTheDocument();
  });

  it('le loyer se nomme par son mois, avec sa quittance et sa pénalité due', () => {
    poser(DU);
    rendre();
    const octobre = within(screen.getByTestId('historique-client')).getAllByRole('listitem')[0];
    expect(within(octobre).getByText('Octobre 2026')).toBeInTheDocument();
    expect(within(octobre).getByRole('button', { name: fr.payments.locataire.historique.quittance })).toBeInTheDocument();
    expect(texte(octobre.querySelector('[data-slot="penalite-due"]')?.textContent)).toContain('Pénalité 67 750 F · 24 jours de retard');
  });

  it('l’icône de reçu ne porte aucun symbole monétaire', () => {
    poser(SANS_ECHEANCE, { historique: [] });
    const { container } = rendre();
    expect(container.querySelector('.lucide-receipt-text')).not.toBeNull();
    expect(container.querySelector('.lucide-receipt')).toBeNull();
  });
});

describe('TCK-2650 — payer à l’agence', () => {
  it('« Comment payer à l’agence » ouvre les moyens déclarés et le montant à y régler', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    poser(DU);
    rendre();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: fr.payments.locataire.tete.commentPayerALAgence }));
    const feuille = await screen.findByRole('dialog');
    expect(texte(feuille.textContent)).toContain('À régler à l’agence Dakar Immo : 135 500 F.');
    expect(texte(feuille.textContent)).toContain('Téléphone de l’agence');
    expect(within(feuille).getByRole('link', { name: fr.payments.locataire.agence.appeler })).toHaveAttribute('href', 'tel:+221776452018');
    // Aucun moyen à distance déclaré : la feuille le dit, elle n'en invente pas.
    expect(within(feuille).getByText(fr.payments.locataire.agence.aucunMoyenDeclare)).toBeInTheDocument();
  });

  it('`?moyen=agence` (le « Payer à l’agence » du retour) ouvre la feuille dès l’arrivée', async () => {
    recherche = 'moyen=agence';
    poser(DU);
    rendre();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('sans `?moyen=agence`, la feuille reste fermée', () => {
    poser(DU);
    rendre();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('TCK-2650 — les échéances à venir', () => {
  const futur = (id: number, mois: string) =>
    ligne({ id, status: 'pending', paid_at: null, paid_amount: 0, remaining_amount: 1_355_000, amount_due: 1_355_000, period_start: `${mois}-01`, period_end: `${mois}-28`, due_date: `${mois}-05` });

  it('seulement les échéances futures, dans l’ordre, six au plus', () => {
    const passe = futur(40, '2026-11');
    passe.due_date = '2026-11-05';
    const lignes = [futur(46, '2027-05'), futur(41, '2026-12'), futur(47, '2027-06'), futur(42, '2027-01'), futur(43, '2027-02'), futur(44, '2027-03'), futur(45, '2027-04'), passe];
    expect(echeancesAVenir(lignes, '2026-11-10').map((r) => r.id)).toEqual([41, 42, 43, 44, 45, 46]);
  });

  it('la section se rend sous l’historique et le lien de la carte y mène', () => {
    poser({ ...DU, next_rent: A_JOUR.next_rent }, { dus: [futur(41, '2026-12'), futur(42, '2027-01')] });
    const { container } = rendre();
    const section = container.querySelector('#echeances-a-venir') as HTMLElement;
    expect(within(section).getByRole('heading', { name: fr.payments.locataire.aVenir.titre })).toBeInTheDocument();
    expect(within(section).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Les 2 prochaines échéances/ })).toHaveAttribute('href', '#echeances-a-venir');
    const historique = screen.getByRole('heading', { name: fr.payments.locataire.historique.titre });
    expect(historique.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('aucune section quand l’échéancier n’est pas émis', () => {
    poser(SANS_ECHEANCE, { dus: [futur(41, '2026-12')], historique: [] });
    const { container } = rendre();
    expect(container.querySelector('#echeances-a-venir')).toBeNull();
  });
});

describe('TCK-2650 — « Payer » : la feuille du choix du moyen', () => {
  const DECEMBRE = ligne({ id: 30, status: 'pending', paid_at: null, paid_amount: 0, remaining_amount: 1_355_000, amount_due: 1_355_000, period_start: '2026-12-01', period_end: '2026-12-31', due_date: '2026-12-05' });

  it('« Payer d’avance » ouvre la feuille : décompte de l’API, seuls les fournisseurs ouverts par le serveur', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    poser(A_JOUR, { dus: [DECEMBRE] });
    rendre();
    await user.click(screen.getByRole('button', { name: fr.payments.locataire.tete.payerDAvance }));
    const feuille = await screen.findByRole('dialog');
    expect(within(feuille).getByText('Payer le loyer de décembre 2026')).toBeInTheDocument();
    expect(texte(within(feuille).getByTestId('total-debite').textContent)).toBe('1 355 000 F');
    expect(within(feuille).getByRole('radio', { name: 'Wave' })).toBeChecked();
    // Le serveur n'ouvre que Wave : Orange Money et la carte n'ont pas de ligne.
    expect(within(feuille).queryByRole('radio', { name: 'Orange Money' })).toBeNull();
    expect(within(feuille).getAllByRole('radio')).toHaveLength(1);
    expect(within(feuille).getByRole('button', { name: nomExact('Payer 1 355 000 F avec Wave') })).toBeEnabled();
  });

  it('payer envoie le fournisseur choisi, avec les adresses de retour et d’annulation de CE paiement', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    fournisseurs = ['wave', 'orange_money'];
    poser(A_JOUR, { dus: [DECEMBRE] });
    rendre();
    await user.click(screen.getByRole('button', { name: fr.payments.locataire.tete.payerDAvance }));
    const feuille = await screen.findByRole('dialog');
    await user.click(within(feuille).getByRole('radio', { name: 'Orange Money' }));
    await user.click(within(feuille).getByRole('button', { name: nomExact('Payer 1 355 000 F avec Orange Money') }));
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const envoi = mutateAsync.mock.calls[0][0] as { provider: string; returnUrl: string; cancelUrl: string };
    expect(envoi.provider).toBe('orange_money');
    expect(envoi.returnUrl).toContain('status=pending&payment_type=lease-payments&payment_id=30');
    expect(envoi.cancelUrl).toContain('status=failed&payment_type=lease-payments&payment_id=30');
  });

  it('sous une dette à l’agence, « Payer maintenant » dit ce qui n’est pas compris dans le paiement', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    poser({ ...DU, next_rent: A_JOUR.next_rent }, { dus: [DECEMBRE] });
    rendre();
    await user.click(screen.getByRole('button', { name: fr.payments.locataire.prochain.payerMaintenant }));
    const feuille = await screen.findByRole('dialog');
    expect(texte(feuille.textContent)).toContain('135 500 F restent à régler à l’agence');
  });

  it('aucun fournisseur ouvert : la feuille le dit et ne laisse pas payer', async () => {
    const user = userEvent.setup({ advanceTimers: () => undefined });
    fournisseurs = [];
    poser(A_JOUR, { dus: [DECEMBRE] });
    rendre();
    await user.click(screen.getByRole('button', { name: fr.payments.locataire.tete.payerDAvance }));
    const feuille = await screen.findByRole('dialog');
    expect(within(feuille).getByText(fr.payments.locataire.payer.aucunMoyen)).toBeInTheDocument();
    expect(within(feuille).queryByRole('radio')).toBeNull();
    expect(within(feuille).getByRole('button', { name: nomExact('Payer 1 355 000 F') })).toBeDisabled();
  });
});

describe('TCK-2650 — « Mon bail » au bureau', () => {
  it('le bien, le loyer, le jour d’échéance, la référence, la caution versée, et l’agence', () => {
    poser(A_JOUR);
    rendre();
    const aside = screen.getByRole('complementary', { name: fr.payments.locataire.monBail.titre });
    const t = texte(aside.textContent);
    expect(t).toContain('Villa 4 chambres');
    expect(t).toContain('1 355 000 F / mois');
    expect(t).toContain('Le 5 de chaque mois');
    expect(t).toContain('LS-0DPA75TK');
    expect(t).toMatch(/Caution versée\s*1 355 000 F/);
    expect(within(aside).getByRole('link', { name: /Voir mon bail/ })).toHaveAttribute('href', '/app/leases/9');
    expect(within(aside).getByRole('link', { name: /Appeler/ })).toHaveAttribute('href', 'tel:+221776452018');
    expect(within(aside).getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toMatch(/^https:\/\/wa\.me\/221776452018\?text=/);
    // Au téléphone, la colonne n'est pas montrée (maquette) : elle n'apparaît que dès `lg`.
    expect(aside.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(aside.className).toMatch(/lg:block/);
  });

  it('échéancier non émis : « Pas encore émise »', () => {
    poser(SANS_ECHEANCE, { historique: [] });
    rendre();
    const aside = screen.getByRole('complementary', { name: fr.payments.locataire.monBail.titre });
    expect(texte(aside.textContent)).toContain(fr.payments.locataire.monBail.pasEncoreEmise);
    expect(texte(aside.textContent)).not.toContain('Caution versée');
  });
});
