/**
 * TCK-2878 (maquette `app-fil-commercial` a, e6 « La candidature arrive » et e7 « Acceptée : le
 * bail ») — l'origine du dépôt, la réponse attendue en heures, le fil du client, le passage en
 * Négociation et son retour, le panneau « Nouveau bail · repris de la candidature », les garants.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { ToastProvider } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { useBooking } from '@/lib/queries/bookings';
import type { EntreeDuFil } from '@/lib/queries/customer-timeline';
import { BookingDetail } from '../BookingDetail';

const ecran = vi.hoisted(() => ({ telephone: false, maintenant: new Date('2026-11-09T09:12:00Z') }));
// TCK-2963 — le bloc de la salle ouvre sa conversation (React Query) : hors du propos de ce test.
vi.mock('@/components/messages/salle/BlocDeLaSalle', () => ({ BlocDeLaSalle: () => null }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: (q: string) => (q.includes('80rem') ? !ecran.telephone : ecran.telephone) }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true, useAgenceDuPersonnelActif: () => 5 }));
vi.mock('@/hooks/useMinuteCourante', () => ({ useMinuteCourante: () => ecran.maintenant }));
vi.mock('@/hooks/useCan', () => ({ useCanAll: () => ({ can: true, isLoading: false }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/usePaymentProviders', () => ({ usePaymentProviders: () => ({ providers: [] }) }));
const routeur = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur, usePathname: () => '/app/bookings/42', useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/queries/bookings', () => ({
  useBooking: vi.fn(),
  useCancelBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConfirmBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRejectBooking: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRefundBookingPayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
const lu = vi.hoisted(() => ({ fil: [] as EntreeDuFil[], derniere: 1 }));
vi.mock('@/lib/queries/booking-dossier', () => ({
  useDossierDeLaReservation: () => ({ data: { data: { received: 3, required: 4, missing: ['guarantor_identity'], pieces: [] } }, isPending: false, isError: false, refetch: vi.fn() }),
  useDemanderUnePiece: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAutresCandidaturesDuBien: () => ({ data: { data: [] } }),
  useVisitesDuClient: () => ({ data: { data: lu.fil, meta: { current_page: 1, last_page: lu.derniere } }, isLoading: false }),
}));
const gestes = vi.hoisted(() => ({ annuler: vi.fn(), creer: vi.fn(), ajouter: vi.fn(), retirer: vi.fn() }));
vi.mock('@/lib/queries/candidature-et-bail', () => ({
  useAnnulerLePassageDEtape: () => ({ mutateAsync: gestes.annuler, isPending: false }),
  useCreerLeBailRepris: () => ({ mutateAsync: gestes.creer, isPending: false }),
  useAjouterUnGarant: () => ({ mutateAsync: gestes.ajouter, isPending: false }),
  useRetirerUnGarant: () => ({ mutateAsync: gestes.retirer, isPending: false }),
}));
vi.mock('@/lib/queries/leases', () => ({ useLeaseDefaults: () => ({ data: { data: { property_id: 9, type: 'residential_rent' } } }) }));

/** Mouhamed a visité, reçu le lien après la visite, puis déposé sa candidature (e6). */
const MOUHAMED = {
  id: 42,
  agency_id: 5,
  kind: 'application',
  status: 'pending',
  source: 'invitation',
  reference_number: 'CAN-2611-0042',
  // La candidature a été déposée quand le bien était à 300 000 F ; il est passé depuis à 320 000 F.
  total_amount: 300_000,
  currency: 'XOF',
  start_date: '2026-12-01',
  created_at: '2026-11-08T20:12:00Z',
  response_deadline: '2026-11-10T20:12:00Z',
  expires_at: '2026-11-15T20:12:00Z',
  customer_id: 3,
  property_id: 9,
  customer: { id: 3, user_id: 40, first_name: 'Mouhamed', last_name: 'Ndiaye', phone: '+221775120844' },
  property: { id: 9, title: 'Pièce de Ouakam', slug: 'ouakam', price: 320_000, currency: 'XOF', contract_type: 'rent', main_photo_url: null },
  booking_payments: [],
  notes: null,
  term_months: 12,
  renewable: true,
  security_deposit_months: 2,
  security_deposit_amount: 600_000,
  dossier: { received: 3, required: 4, missing: ['guarantor_identity'] },
  has_guarantor: true,
  guarantors: [{ id: 8, first_name: 'Ibrahima', last_name: 'Dieng', relationship_to_tenant: 'frère' }],
};

const ACCEPTEE = {
  ...MOUHAMED,
  status: 'confirmed',
  confirmed_at: '2026-11-09T09:05:00Z',
  stage_change: { from: 'qualified', to: 'negotiating', at: '2026-11-09T09:05:00Z', undoable_until: '2026-11-10T09:05:00Z', undone_at: null },
};

/** Le fil de Mouhamed, du plus récent au plus ancien, comme l'API le sert. */
const FIL: EntreeDuFil[] = [
  { type: 'booking', id: 42, at: '2026-11-08T20:12:00Z', milestone: 'created', kind: 'application', status: 'pending', reference_number: 'CAN-2611-0042', amount: '300000.00', currency: 'XOF', start_date: '2026-12-01', property: { id: 9, title: 'Pièce de Ouakam' } },
  { type: 'contact', id: 70, at: '2026-11-07T10:42:00Z', channel: 'whatsapp', on: 'lead', causer: { id: 1, name: 'Sokhna Sène' } },
  { type: 'note', id: 61, at: '2026-11-07T10:41:00Z', kind: 'visit_report', body: null, pinned: false, property_visit_id: 5, author: { id: 1, name: 'Sokhna Sène' }, report: { visit_id: 5, outcome: 'interested', objections: [], follow_up: null } },
  { type: 'visit', id: 5, at: '2026-11-03T09:21:00Z', milestone: 'confirmed', status: 'completed', scheduled_at: '2026-11-07T10:00:00Z', property: { id: 9, title: 'Pièce de Ouakam' } },
  { type: 'note', id: 60, at: '2026-11-02T17:47:00Z', kind: 'lead_message', body: 'Est-elle libre ?', pinned: true, property_visit_id: null, author: null, property: { id: 9, title: 'Pièce de Ouakam' } },
];

const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/[  ]/g, ' ');
const tFiche = fr.bookings.fiche;

function rendre(booking: Record<string, unknown>) {
  vi.mocked(useAuth).mockReturnValue({ user: { id: 1, roles: ['agent'] }, token: 'tok' } as unknown as ReturnType<typeof useAuth>);
  vi.mocked(useBooking).mockReturnValue({ data: { data: booking }, isLoading: false, isError: false } as unknown as ReturnType<typeof useBooking>);
  return render(
    withIntl(
      <ToastProvider>
        <BookingDetail bookingId={Number(booking.id)} />
      </ToastProvider>,
    ),
  );
}

describe('BookingDetail — la candidature arrive, puis le bail (TCK-2878)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ecran.telephone = false;
    ecran.maintenant = new Date('2026-11-09T09:12:00Z');
    lu.fil = [];
    lu.derniere = 1;
  });

  it('AC1 — à 390, une candidature par invitation dit « par le lien envoyé après la visite »', () => {
    ecran.telephone = true;
    rendre(MOUHAMED);
    const bandeau = document.querySelector<HTMLElement>('[data-slot="bandeau-d-origine"]')!;
    expect(texte(bandeau)).toContain('Mouhamed a déposé sa candidature');
    expect(texte(bandeau)).toContain(tFiche.origine.parLeLien);
  });

  it('AC1 — une candidature venue du site public ne le dit pas ; une candidature saisie n’a pas de bandeau', () => {
    ecran.telephone = true;
    const { unmount } = rendre({ ...MOUHAMED, source: 'public' });
    const bandeau = document.querySelector<HTMLElement>('[data-slot="bandeau-d-origine"]')!;
    expect(texte(bandeau)).toContain('Mouhamed a déposé sa candidature');
    expect(texte(bandeau)).not.toContain(tFiche.origine.parLeLien);
    unmount();
    rendre({ ...MOUHAMED, source: 'staff' });
    expect(document.querySelector('[data-slot="bandeau-d-origine"]')).toBeNull();
  });

  it('AC2 — reçue il y a 13 h, échéance à +35 h : « réponse attendue sous 35 h », et plus de ligne « Expire le »', () => {
    ecran.telephone = true;
    // Le même jour (l'âge d'une demande d'hier se dit « hier ») : déposée à 07:00, lue à 20:00.
    ecran.maintenant = new Date('2026-11-09T20:00:00Z');
    rendre({ ...MOUHAMED, created_at: '2026-11-09T07:00:00Z', response_deadline: '2026-11-11T07:00:00Z' });
    expect(texte(document.body)).toContain('reçue il y a 13 h · réponse attendue sous 35 h');
    expect(screen.queryByText(fr.bookings.detail.expiresAt, { selector: 'dt' })).toBeNull();
  });

  it('e6 bureau — le sous-titre dit le dépôt par le lien et la réponse attendue', () => {
    rendre(MOUHAMED);
    expect(texte(document.body)).toContain('Déposée');
    expect(texte(document.body)).toContain('par le lien envoyé après la visite · réponse attendue sous 35 h');
  });

  it('e6 — le garant est nommé dans le Qui', () => {
    rendre(MOUHAMED);
    expect(texte(document.querySelector<HTMLElement>('[data-slot="bloc-qui"]')!)).toContain('Garant : Ibrahima Dieng, frère');
  });

  it('AC3 — acceptée : « Passé en Négociation » ; « Annuler » remet l’étape, puis disparaît', async () => {
    gestes.annuler.mockResolvedValue({});
    rendre(ACCEPTEE);
    const encart = document.querySelector<HTMLElement>('[data-slot="etape-du-client"]')!;
    expect(texte(encart)).toContain('Passé en Négociation');
    expect(texte(encart)).toContain('Qualifié → Négociation, proposé par la candidature');
    fireEvent.click(within(encart).getByRole('button', { name: tFiche.etape.annuler }));
    await waitFor(() => expect(texte(encart)).toContain('Étape remise en Qualifié'));
    expect(gestes.annuler).toHaveBeenCalledTimes(1);
    expect(within(encart).queryByRole('button', { name: tFiche.etape.annuler })).toBeNull();
  });

  it('AC3 — « Annuler » n’existe plus une fois `undoable_until` passé ; un refus se lit sous l’encart', async () => {
    const { unmount } = rendre({ ...ACCEPTEE, stage_change: { ...ACCEPTEE.stage_change, undoable_until: '2026-11-09T09:00:00Z' } });
    expect(within(document.querySelector<HTMLElement>('[data-slot="etape-du-client"]')!).queryByRole('button')).toBeNull();
    unmount();
    gestes.annuler.mockRejectedValue(new ApiError(409, { message: 'Cette étape a changé depuis l’acceptation.' }));
    rendre(ACCEPTEE);
    fireEvent.click(screen.getByRole('button', { name: tFiche.etape.annuler }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Cette étape a changé depuis l’acceptation.');
  });

  it('e7 — l’acceptation dit que le client est prévenu, sans nommer un canal', () => {
    rendre(ACCEPTEE);
    const bandeau = texte(document.querySelector<HTMLElement>('[data-slot="bandeau-acceptee"]')!);
    expect(bandeau).toContain('Candidature acceptée');
    expect(bandeau).toContain('Mouhamed est prévenu');
    expect(bandeau).not.toMatch(/SMS/);
  });

  it('AC4 — le panneau crée le bail au loyer de la candidature (300 000 F, pas 320 000 F), avec sa caution, sans garant envoyé', async () => {
    gestes.creer.mockResolvedValue({ data: { id: 77 } });
    rendre(ACCEPTEE);
    fireEvent.click(screen.getByRole('button', { name: fr.bookings.detail.actions.createLease }));
    const panneau = document.querySelector<HTMLElement>('[data-slot="panneau-du-bail-repris"]')!;
    expect(texte(panneau)).toContain('300 000 F');
    expect(texte(panneau)).not.toContain('320 000 F');
    expect(texte(panneau)).toContain('Ibrahima Dieng · frère');
    expect(texte(panneau)).toContain(tFiche.bailRepris.garantAide);
    expect(texte(panneau)).toContain('6 champs repris de la candidature.');
    expect(screen.getByRole('link', { name: tFiche.bailRepris.formulaire })).toHaveAttribute('href', '/app/leases/new?booking_id=42');
    const creer = screen.getAllByRole('button', { name: tFiche.bailRepris.creer }).at(-1)!;
    fireEvent.click(creer);
    await waitFor(() => expect(gestes.creer).toHaveBeenCalledTimes(1));
    const corps = gestes.creer.mock.calls[0]![0] as Record<string, unknown>;
    expect(corps).toMatchObject({ property_id: 9, tenant_id: 3, booking_id: 42, type: 'residential_rent', start_date: '2026-12-01', end_date: '2027-11-30', monthly_rent: 300_000, deposit_amount: 600_000 });
    expect(corps).not.toHaveProperty('guarantor_id');
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/leases/77'));
  });

  it('AC5 — à 1440, « Le fil de Mouhamed » liste la candidature, le lien envoyé, le compte rendu, la visite et la demande ; « Fiche client »', () => {
    lu.fil = FIL;
    rendre(MOUHAMED);
    const carte = screen.getByRole('heading', { name: 'Le fil de Mouhamed' }).closest('section')!;
    const lignes = [...carte.querySelectorAll('[data-slot="ligne-du-fil"]')].map((l) => texte(l as HTMLElement));
    expect(lignes).toHaveLength(5);
    expect(lignes[0]).toContain('Candidature déposée');
    expect(lignes[1]).toContain('Réponse WhatsApp');
    expect(lignes[2]).toContain('Compte rendu');
    expect(lignes[3]).toContain('Visite confirmée');
    expect(lignes[4]).toContain('Demande reçue sur Pièce de Ouakam');
    expect(within(carte).getByRole('link', { name: tFiche.fil.ficheClient })).toHaveAttribute('href', '/app/customers/3');
  });

  it('e7 téléphone — « De la demande au bail · 7 jours » : de la demande (2 nov.) à l’acceptation (9 nov.)', () => {
    ecran.telephone = true;
    lu.fil = [{ type: 'booking', id: 42, at: '2026-11-09T09:05:00Z', milestone: 'confirmed', kind: 'application', status: 'confirmed', reference_number: null, amount: null, currency: null, start_date: null, property: null }, ...FIL];
    rendre(ACCEPTEE);
    const section = screen.getByRole('heading', { name: tFiche.fil.demandeAuBail }).closest('section')!;
    expect(texte(section)).toContain('7 jours');
    expect(texte(section)).toContain('Candidature acceptée');
  });

  it('« N jours » se tait quand le fil lu n’est pas entier (le premier fait n’est pas connu)', () => {
    ecran.telephone = true;
    lu.fil = FIL;
    lu.derniere = 2;
    rendre(ACCEPTEE);
    const section = screen.getByRole('heading', { name: tFiche.fil.demandeAuBail }).closest('section')!;
    expect(texte(section)).not.toMatch(/\d+ jours?/);
  });

  it('les garants : un refus de l’API (booking.max_guarantors) se dit dans les mots du front', async () => {
    gestes.ajouter.mockRejectedValue(new ApiError(422, { code: 'booking.max_guarantors' }));
    rendre(MOUHAMED);
    fireEvent.click(screen.getByRole('button', { name: tFiche.garants.ajouter }));
    fireEvent.change(screen.getByLabelText(tFiche.garants.prenom), { target: { value: 'Awa' } });
    fireEvent.change(screen.getByLabelText(tFiche.garants.nom), { target: { value: 'Ba' } });
    fireEvent.click(screen.getByRole('button', { name: tFiche.garants.enregistrer }));
    expect(await screen.findByRole('alert')).toHaveTextContent(tFiche.garants.codes.troisAuPlus);
    expect(gestes.ajouter).toHaveBeenCalledWith({ first_name: 'Awa', last_name: 'Ba' });
  });

  it('TCK-2875 AC6 — l’historique dit « Demande de contact reçue » sur CE bien ; une demande d’un autre bien n’y est pas', () => {
    lu.fil = [
      ...FIL,
      { type: 'note', id: 59, at: '2026-10-20T10:00:00Z', kind: 'lead_message', body: 'Et la villa ?', pinned: true, property_visit_id: null, author: null, property: { id: 99, title: 'Villa des Almadies' } },
    ];
    rendre(MOUHAMED);
    const historique = screen.getByRole('heading', { name: tFiche.sections.historique }).closest('section')!;
    expect(within(historique).getAllByText(tFiche.historique.demande)).toHaveLength(1);
  });

  it('les garants : « Retirer » envoie le garant à retirer', async () => {
    gestes.retirer.mockResolvedValue({});
    rendre(MOUHAMED);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer Ibrahima Dieng' }));
    await waitFor(() => expect(gestes.retirer).toHaveBeenCalledWith({ guarantorId: 8 }));
  });
});
