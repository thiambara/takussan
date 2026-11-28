/**
 * TCK-2875 (ADR-0110, maquette `app-reservations` a, e1 et e3) — la fiche d'une candidature : les
 * conditions (Durée, Caution, À verser à l'entrée), les revenus en RAPPORT au loyer et le garant, la
 * visite déjà faite, le dossier (« 3/4 pièces », Ouvrir, Demander tu 24 h), la carte « Décision » au
 * bureau, la caution dans la suite du bail, et les visites du client sur ce bien dans l'historique.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ToastProvider } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useBooking } from '@/lib/queries/bookings';
import type { EntreeDuFil } from '@/lib/queries/customer-timeline';
import type { PieceDuDossier } from '@/types/booking';
import { gestesServis } from './abilities-de-test';
import { BookingDetail } from '../BookingDetail';

const MAINTENANT = new Date('2026-11-12T10:00:00Z');
const ecran = vi.hoisted(() => ({ telephone: false, personnel: true }));
// TCK-2963 — le bloc de la salle ouvre sa conversation (React Query) : hors du propos de ce test.
vi.mock('@/components/messages/salle/BlocDeLaSalle', () => ({ BlocDeLaSalle: () => null }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.telephone }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => ecran.personnel, useAgenceDuPersonnelActif: () => 5 }));
vi.mock('@/hooks/useMinuteCourante', () => ({ useMinuteCourante: () => new Date('2026-11-12T10:00:00Z') }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: [] }) }));
vi.mock('@/lib/queries/bookings', () => ({
  useBooking: vi.fn(),
  useCancelBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRefundBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
// TCK-2878 — les gestes de la candidature et du bail (retour d'étape, bail repris, garants) : hors du sujet ici.
vi.mock('@/lib/queries/candidature-et-bail', () => ({
  useAnnulerLePassageDEtape: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreerLeBailRepris: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAjouterUnGarant: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRetirerUnGarant: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const lu = vi.hoisted(() => ({
  pieces: [] as PieceDuDossier[],
  demander: vi.fn(),
  autres: [] as Record<string, unknown>[],
  autresLus: [] as number[],
  fil: [] as EntreeDuFil[],
  filLu: 0,
}));
// TCK-2879 — les gestes du client (dépôt d'une pièce, réponse à la contre-offre) : la fiche les monte au client.
vi.mock('@/lib/queries/booking-gestes-du-client', () => ({
  PIECE_DU_DOSSIER_ACCEPT: 'application/pdf',
  PIECE_DU_DOSSIER_MAX_OCTETS: 10 * 1024 * 1024,
  useDeposerUnePiece: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRepondreALaContreOffre: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/queries/booking-dossier', () => ({
  useDossierDeLaReservation: () => ({ data: { data: { received: 3, required: 4, missing: [], pieces: lu.pieces } }, isPending: false, isError: false, refetch: vi.fn() }),
  useDemanderUnePiece: () => ({ mutateAsync: lu.demander, isPending: false }),
  useAutresCandidaturesDuBien: (propertyId: number) => {
    lu.autresLus.push(propertyId);
    return { data: { data: lu.autres } };
  },
  useVisitesDuClient: () => {
    lu.filLu += 1;
    return { data: { data: lu.fil } };
  },
}));

const recue = (piece: PieceDuDossier['piece'], id: number, nom: string): PieceDuDossier => ({
  piece,
  required: true,
  received: true,
  received_at: '2026-11-10T08:52:00Z',
  requested_at: null,
  document: { id, name: nom, type: 'other', created_at: '2026-11-10T08:52:00Z' },
});
const PIECES: PieceDuDossier[] = [
  recue('identity', 501, 'Carte nationale'),
  recue('payslips', 502, 'Bulletins août-octobre'),
  recue('employment_certificate', 503, 'Attestation'),
  { piece: 'guarantor_commitment', required: true, received: false, received_at: null, requested_at: null, document: null },
];

/** La candidature d'Ousmane (e1) : loyer 300 000 F, caution 2 mois, avance 1 mois, garant, dossier 3/4. */
const OUSMANE = {
  id: 42,
  agency_id: 5,
  kind: 'application',
  status: 'pending',
  reference_number: 'CAN-2611-0042',
  total_amount: 300_000,
  currency: 'XOF',
  start_date: '2026-12-01',
  created_at: '2026-11-10T08:52:00Z',
  expires_at: '2026-11-17T08:52:00Z',
  customer_id: 3,
  property_id: 9,
  customer: { id: 3, user_id: 40, first_name: 'Ousmane', last_name: 'Ba', phone: '+221775120844', occupation: 'Fonctionnaire' },
  property: { id: 9, title: 'F3', slug: 'f3', price: 300_000, currency: 'XOF', contract_type: 'rent', location: { quarter: 'Sacré-Cœur 3' }, main_photo_url: null },
  booking_payments: [],
  notes: 'Je peux signer dès cette semaine.',
  term_months: 12,
  renewable: true,
  security_deposit_months: 2,
  security_deposit_amount: 600_000,
  advance_months_at_booking: 1,
  entry_amount: 900_000,
  visits_on_property: 1,
  last_visit_on_property: { scheduled_at: '2026-11-07T11:00:00Z', report_verdict: 'interested' },
  other_pending_on_property: 1,
  dossier: { received: 3, required: 4, missing: ['guarantor_commitment'] },
  has_guarantor: true,
  guarantors: [{ id: 8, first_name: 'Awa', last_name: 'Ba', relationship_to_tenant: 'parent' }],
  declared_monthly_income_masked: '9•••••',
  income_to_rent_ratio: 3.2,
};

const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/[\u202f\u00a0]/g, ' ');
const tFiche = fr.bookings.fiche;

function rendre(booking: Record<string, unknown>, user: { id: number; roles: string[] } = { id: 3, roles: ['agent'] }) {
  vi.mocked(useAuth).mockReturnValue({ user, token: 'tok' } as unknown as ReturnType<typeof useAuth>);
  // TCK-3007 — les gestes que l'API servirait à ce lecteur.
  const servie = { ...booking, abilities: booking.abilities ?? gestesServis(booking, (user.roles.includes('customer') ? 'client' : user.roles.includes('owner') ? 'bailleur' : 'personnel')) };
  vi.mocked(useBooking).mockReturnValue({ data: { data: servie }, isLoading: false, isError: false } as unknown as ReturnType<typeof useBooking>);
  return render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={Number(booking.id)} />
      </ToastProvider>,
    ),
  );
}

/** La valeur d'une ligne clé → valeur (`LigneCle`). */
function valeurDe(cle: string): string {
  const dt = screen.getAllByText(cle, { selector: 'dt' })[0]!;
  return texte(dt.nextElementSibling as HTMLElement);
}

describe('BookingDetail — candidature, conditions et dossier (TCK-2875)', () => {
  beforeEach(() => {
    ecran.telephone = false;
    ecran.personnel = true;
    lu.pieces = PIECES.map((p) => ({ ...p }));
    lu.demander.mockReset();
    lu.autres = [
      { id: 42, customer_id: 3, customer: { id: 3, first_name: 'Ousmane', last_name: 'Ba' }, dossier: { received: 3, required: 4, missing: [] } },
      { id: 41, customer_id: 4, customer: { id: 4, first_name: 'Khady', last_name: 'Faye' }, dossier: { received: 4, required: 4, missing: [] } },
    ];
    lu.autresLus.length = 0;
    lu.fil = [];
    lu.filLu = 0;
  });

  it('AC1 — à 390, le Quoi dit « 12 mois, renouvelable », « 2 mois · 600 000 F », « 900 000 F »', () => {
    ecran.telephone = true;
    rendre(OUSMANE);
    expect(valeurDe(tFiche.quoi.duree)).toBe('12 mois, renouvelable');
    expect(valeurDe(tFiche.quoi.caution)).toBe('2 mois · 600 000 F');
    expect(valeurDe(tFiche.quoi.aVerser)).toBe('900 000 F');
  });

  it('une candidature d’avant TCK-2870 (conditions nulles) ne dit ni durée, ni caution, ni « à verser »', () => {
    rendre({ ...OUSMANE, term_months: null, renewable: null, security_deposit_months: null, security_deposit_amount: null, entry_amount: null });
    expect(screen.queryByText(tFiche.quoi.duree, { selector: 'dt' })).toBeNull();
    expect(screen.queryByText(tFiche.quoi.caution, { selector: 'dt' })).toBeNull();
    expect(screen.queryByText(tFiche.quoi.aVerser, { selector: 'dt' })).toBeNull();
  });

  it('AC5 — les revenus se disent par leur rapport au loyer, jamais le montant masqué ; le garant ; la visite datée avec son verdict', () => {
    ecran.telephone = true;
    rendre(OUSMANE);
    const qui = document.querySelector<HTMLElement>('[data-slot="bloc-qui"]')!;
    expect(texte(qui)).toContain('Revenus 3,2 × le loyer');
    // TCK-2878 — le garant NOMMÉ (maquette e6 : « Garant · Oui · Ibrahima Dieng, son frère »).
    expect(texte(qui)).toContain('Garant : Awa Ba, parent');
    expect(texte(document.body)).not.toContain('9•••••');
    expect(texte(qui.querySelector<HTMLElement>('[data-slot="deja-visite"]')!)).toBe('A déjà visité ce bien. Sam. 7 nov. : « Intéressé ».');
  });

  it('le lecteur à qui l’API ne sert ni revenus ni garant ne voit aucune de ces pastilles', () => {
    const { income_to_rent_ratio: _r, has_guarantor: _g, guarantors: _gs, declared_monthly_income_masked: _m, ...sansFaits } = OUSMANE;
    rendre(sansFaits);
    const qui = document.querySelector<HTMLElement>('[data-slot="bloc-qui"]')!;
    expect(texte(qui)).not.toContain('Revenus');
    expect(texte(qui)).not.toContain('Garant');
  });

  it('AC2 — « 3/4 pièces » ; « Demander » sur l’engagement du garant envoie la demande, puis « Demandée à l’instant », inactif', async () => {
    ecran.telephone = true;
    lu.demander.mockResolvedValue({ data: { ...PIECES[3], requested_at: MAINTENANT.toISOString(), customer_notified: true } });
    rendre(OUSMANE);
    expect(screen.getAllByText('3/4 pièces').length).toBeGreaterThan(0);
    const pieces = document.querySelector<HTMLElement>('[data-slot="pieces-du-dossier"]')!;
    // Une pièce reçue s'ouvre par la fiche de son document.
    expect(within(pieces).getByRole('link', { name: 'Ouvrir : Pièce d’identité' })).toHaveAttribute('href', '/app/documents/501');
    await act(async () => {
      fireEvent.click(within(pieces).getByRole('button', { name: 'Demander : Engagement du garant' }));
    });
    expect(lu.demander).toHaveBeenCalledWith({ piece: 'guarantor_commitment' });
    const geste = within(pieces).getByRole('button', { name: 'Demandée à l’instant' });
    expect(geste).toBeDisabled();
  });

  it('une pièce demandée il y a 3 h garde son geste tu, avec son âge', () => {
    lu.pieces[3] = { ...lu.pieces[3]!, requested_at: '2026-11-12T07:00:00Z' };
    rendre(OUSMANE);
    expect(screen.getByRole('button', { name: 'Demandée il y a 3 h' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Demander/ })).toBeNull();
  });

  it('le refus 429 de l’API se lit sous la pièce', async () => {
    const { ApiError } = await import('@/lib/api');
    lu.demander.mockRejectedValue(new ApiError(429, { code: 'booking.dossier_request_throttled' }));
    rendre(OUSMANE);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Demander : Engagement du garant' }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(tFiche.dossier.erreurs.throttled);
  });

  it('AC3 — au bureau, la carte « Décision » d’une candidature : la synthèse, « 1 autre candidature sur ce bien · Comparer », Refuser / Accepter', () => {
    rendre(OUSMANE);
    const carte = document.querySelector<HTMLElement>('[data-slot="decision-de-la-candidature"]')!;
    expect(texte(carte)).toContain('Revenus de 3,2 fois le loyer, garant déclaré. Il manque l’engagement du garant.');
    expect(texte(carte)).toContain('1 autre candidature sur ce bien');
    expect(texte(carte)).toContain('Khady Faye · dossier 4/4');
    const comparer = within(carte).getByRole('link', { name: 'Comparer' });
    expect(comparer).toHaveAttribute('href', '/app/bookings?kind=application&status=pending&bien=9');
    expect(lu.autresLus).toEqual(expect.arrayContaining([9]));
    expect(within(carte).getByRole('button', { name: fr.bookings.detail.actions.reject })).toBeInTheDocument();
    expect(within(carte).getByRole('button', { name: fr.bookings.detail.actions.accept })).toBeInTheDocument();
  });

  it('AC3 — sans autre candidature en attente, ni « Comparer » ni lecture des autres', () => {
    rendre({ ...OUSMANE, other_pending_on_property: 0 });
    const carte = document.querySelector<HTMLElement>('[data-slot="decision-de-la-candidature"]')!;
    expect(within(carte).queryByRole('link', { name: 'Comparer' })).toBeNull();
    expect(lu.autresLus).toEqual([]);
  });

  it('e3 — acceptée : la suite du bail dit la caution, et la carte « Décision » n’existe plus', () => {
    rendre({ ...OUSMANE, status: 'confirmed', confirmed_at: '2026-11-12T09:20:00Z' });
    const suite = document.querySelector<HTMLElement>('[data-slot="suite-du-bail"]')!;
    expect(texte(suite)).toContain(`${tFiche.suiteBail.caution}600 000 F`);
    expect(document.querySelector('[data-slot="decision-de-la-candidature"]')).toBeNull();
    expect(document.querySelector('[data-slot="pieces-du-dossier"]')).not.toBeNull();
  });

  it('AC6 — l’historique mêle la visite effectuée sur CE bien, datée, avant « Candidature déposée » ; une visite d’un autre bien n’y est pas', () => {
    lu.fil = [
      { type: 'note', id: 1, at: '2026-11-07T12:00:00Z', kind: 'visit_report', body: 'Veut revoir la cuisine', pinned: true, property_visit_id: 11, author: { id: 2, name: 'Sokhna Sène' }, report: { visit_id: 11, outcome: 'interested', objections: [], follow_up: null } },
      { type: 'visit', id: 11, at: '2026-11-05T09:00:00Z', milestone: 'confirmed', status: 'completed', scheduled_at: '2026-11-07T11:00:00Z', property: { id: 9, title: 'F3' } },
      { type: 'note', id: 2, at: '2026-11-03T12:00:00Z', kind: 'visit_report', body: 'Trop loin', pinned: true, property_visit_id: 12, author: { id: 2, name: 'Sokhna Sène' }, report: { visit_id: 12, outcome: 'not_interested', objections: [], follow_up: null } },
      { type: 'visit', id: 12, at: '2026-11-01T09:00:00Z', milestone: 'confirmed', status: 'completed', scheduled_at: '2026-11-03T11:00:00Z', property: { id: 99, title: 'Villa' } },
    ];
    ecran.telephone = true;
    rendre(OUSMANE);
    const lignes = Array.from(document.querySelectorAll<HTMLElement>('ol > li')).map(texte);
    const visite = lignes.findIndex((l) => l.startsWith('Visite effectuée avec Sokhna Sène — « Intéressé, veut revoir la cuisine »'));
    const deposee = lignes.findIndex((l) => l.startsWith('Candidature déposée par Ousmane Ba'));
    expect(visite).toBeGreaterThan(-1);
    // Du plus récent au plus ancien : la candidature (10 nov.) d'abord, la visite (7 nov.) ensuite.
    expect(deposee).toBeGreaterThan(-1);
    expect(visite).toBeGreaterThan(deposee);
    expect(lignes[visite]).toContain('Sam. 7 nov.');
    expect(lignes.some((l) => l.toLowerCase().includes('trop loin'))).toBe(false);
  });

  it('le candidat lui-même ne voit ni la carte « Décision », ni Ouvrir ni Demander sur son dossier', () => {
    ecran.personnel = false;
    rendre(OUSMANE, { id: 40, roles: ['customer'] });
    expect(document.querySelector('[data-slot="decision-de-la-candidature"]')).toBeNull();
    const pieces = document.querySelector<HTMLElement>('[data-slot="pieces-du-dossier"]')!;
    expect(within(pieces).queryByRole('link')).toBeNull();
    // TCK-2879 — ni « Demander » : ses seuls boutons sont le dépôt de ses pièces manquantes.
    expect(within(pieces).queryByRole('button', { name: /Demander/ })).toBeNull();
    for (const b of within(pieces).queryAllByRole('button')) expect(b.getAttribute('aria-label')).toMatch(/^(Prendre une photo|Déposer un fichier) : /);
  });

  it('une offre (TCK-2876) n’a ni section Dossier ni pastille Garant', () => {
    rendre({ ...OUSMANE, kind: 'offer', property: { ...OUSMANE.property, contract_type: 'sale' }, dossier: { received: 1, required: 2, missing: ['proof_of_funds'] }, has_guarantor: false });
    expect(document.querySelector('[data-slot="pieces-du-dossier"]')).toBeNull();
    expect(texte(document.querySelector<HTMLElement>('[data-slot="bloc-qui"]')!)).not.toContain('Garant');
  });

  it('le fil du client n’est pas lu hors du personnel ; TCK-2878 : il l’est sans visite sur ce bien (la demande de contact y entre)', () => {
    ecran.personnel = false;
    rendre(OUSMANE);
    expect(lu.filLu).toBe(0);
    ecran.personnel = true;
    rendre({ ...OUSMANE, last_visit_on_property: null });
    expect(lu.filLu).toBeGreaterThan(0);
  });
});
