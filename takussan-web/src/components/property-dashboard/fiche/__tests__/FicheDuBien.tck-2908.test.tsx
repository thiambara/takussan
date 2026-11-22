/**
 * TCK-2908 — l'onglet « Location » de la fiche (maquette `app-biens` a-2), ce que les données neuves y
 * ajoutent :
 *  · AC5 — « Révision possible le 1 juil. 2027 » (`next_revision_date` du bail, TCK-2906), rien sans elle ;
 *    « avis d'échéance le … » à côté du prochain loyer (`occupancy.next_due_notice_date`, TCK-2915) quand
 *    cette date le précède ; sinon la ligne garde sa forme d'avant ;
 *  · AC6 — le moyen de paiement de chaque échéance payée de l'historique (« Wave », « Virement bancaire ») ;
 *  · AC7 — « Agent principal · 1 collaborateur » quand le bien a un autre collaborateur que l'agent principal.
 */
import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { OccupationDuBien, PropertyDetail } from '@/types/property';

const etat = vi.hoisted(() => ({
  bail: null as null | { data: Record<string, unknown> },
  echeances: [] as unknown[],
}));

const succes = (data: unknown) => ({ data, isSuccess: true, isPending: false, isError: false, refetch: vi.fn() });

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/queries/leases', () => ({ useLease: (id: number | null) => (id ? succes(etat.bail) : { data: undefined, isPending: true, isError: false }) }));
vi.mock('@/lib/queries/payments', () => ({
  usePaymentsHistory: () => succes({ data: etat.echeances, meta: { total: etat.echeances.length } }),
}));
vi.mock('@/lib/queries/inventory', () => ({ useInventories: () => succes({ data: [] }) }));
vi.mock('@/components/admin/finances/impayes/Impayes', () => ({ FeuilleDeRelance: () => null }));
vi.mock('@/components/leases/LeasePaymentDialog', () => ({ LeasePaymentDialog: () => null }));

const { OngletLocation } = await import('../OngletLocation');
const { BlocResponsable, avisDuProchainLoyer } = await import('../PiecesDeLaLocation');

const occupation = (extra: Partial<OccupationDuBien> = {}): OccupationDuBien => ({
  state: 'occupied',
  vacant_since: null,
  lease: { id: 7, reference_number: 'LS-7KQ2', type: 'residential_rent', status: 'active', start_date: '2026-07-01', end_date: '2029-06-30' },
  tenant: { id: 3, first_name: 'Mariama', last_name: 'Sow', phone: '+221776124085' },
  rent: { amount: 2_150_000, charges: null, currency: 'XOF', payment_frequency: 'monthly' },
  current_month: { status: 'late', due_date: '2026-11-05', days_late: 6, amount_due: 2_150_000, late_fee_outstanding: 0 },
  ...extra,
});

const bien = (occupancy: OccupationDuBien | null, extra: Partial<PropertyDetail> = {}): PropertyDetail =>
  ({
    id: 9,
    title: 'Villa 5 chambres · Ouest Foire',
    contract_type: 'rent',
    rent_period: 'monthly',
    price: 2_150_000,
    currency: 'XOF',
    owner: { id: 50, name: 'Mouhamed Sène' },
    owner_profile_id: 31,
    is_online: false,
    occupancy,
    ...extra,
  }) as unknown as PropertyDetail;

const rendre = (p: PropertyDetail) =>
  render(withIntl(<OngletLocation property={p} personnel lienVersLeBailleur={false} onOuvrirLAnnonce={() => {}} />));
const pile = () => document.querySelector('[data-slot="location-pile"]') as HTMLElement;
const bureau = () => document.querySelector('[data-slot="location-bureau"]') as HTMLElement;

// Les dates de 2026 se lisent sans leur année (`jourMois`) tant que l'horloge est en 2026 : on l'y fige.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-11T10:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  etat.bail = { data: { id: 7, abilities: { record_payment: true }, deposit_amount: 0, currency: 'XOF', next_revision_date: null } };
  etat.echeances = [];
});

describe('TCK-2908 (AC5) — « À venir » : la révision et l’avis d’échéance', () => {
  it('`next_revision_date = 2027-07-01` rend « Révision possible le 1 juil. 2027 », au téléphone comme au bureau', () => {
    etat.bail = { data: { ...etat.bail!.data, next_revision_date: '2027-07-01' } };
    rendre(bien(occupation()));
    for (const zone of [pile(), bureau()]) {
      expect(zone).toHaveTextContent('Révision possible le 1 juil. 2027');
      expect(zone).toHaveTextContent('Clause d’indexation annuelle');
    }
  });

  it('sans date de révision, la ligne n’est pas rendue', () => {
    rendre(bien(occupation()));
    expect(document.body).not.toHaveTextContent('Révision possible');
  });

  it('l’avis du prochain loyer se dit à côté de lui : « 2 150 000 F / mois · avis d’échéance le 2 déc. »', () => {
    rendre(bien(occupation({ next_due_notice_date: '2026-12-02' })));
    expect(pile()).toHaveTextContent('Prochain loyer le 5 déc.');
    expect(pile()).toHaveTextContent(/2\s150\s000\sF \/ mois · avis d’échéance le 2 déc\./);
  });

  it('sans date d’avis, ou un avis qui vise encore l’échéance du mois, la ligne garde sa forme', () => {
    const { unmount } = rendre(bien(occupation({ next_due_notice_date: null })));
    expect(pile()).not.toHaveTextContent('avis d’échéance');
    unmount();
    rendre(bien(occupation({ next_due_notice_date: '2026-11-02' })));
    expect(pile()).not.toHaveTextContent('avis d’échéance');
  });

  it('la règle d’appariement : après l’échéance du mois, au plus tard le jour du prochain loyer', () => {
    const o = (avis: string) => ({ occupation: occupation({ next_due_notice_date: avis }), prochainLoyer: '2026-12-05' });
    expect(avisDuProchainLoyer(o('2026-12-02'))).toBe('2026-12-02');
    expect(avisDuProchainLoyer(o('2026-12-05'))).toBe('2026-12-05');
    expect(avisDuProchainLoyer(o('2026-11-05'))).toBeNull();
    expect(avisDuProchainLoyer(o('2027-01-02'))).toBeNull();
    expect(avisDuProchainLoyer({ occupation: occupation({ next_due_notice_date: '2026-12-02' }), prochainLoyer: null })).toBeNull();
  });
});

describe('TCK-2908 (AC6) — le moyen de paiement dans l’historique des loyers', () => {
  it('chaque échéance payée dit son moyen ; sans moyen, « Reçu le … » seul', () => {
    const payee = (id: number, due: string, paid: string, moyen: string | null) => ({
      id, source: 'lease', due_date: due, period_start: due, amount: 2_150_000, currency: 'XOF', status: 'paid',
      paid_amount: 2_150_000, remaining_amount: 0, days_late: 0, paid_at: paid, payment_method: moyen,
    });
    etat.echeances = [
      payee(1, '2026-10-05', '2026-10-29T10:00:00Z', 'wave'),
      payee(2, '2026-09-05', '2026-09-04T10:00:00Z', 'bank_transfer'),
      payee(3, '2026-08-05', '2026-08-05T10:00:00Z', null),
    ];
    rendre(bien(occupation()));
    const lignes = within(bureau()).getAllByTestId('ligne-d-echeance');
    expect(lignes[0]).toHaveTextContent('Reçu le 29 oct. · Wave');
    expect(lignes[1]).toHaveTextContent('Reçu le 4 sept. · Virement bancaire');
    expect(lignes[2]).toHaveTextContent('Reçu le 5 août');
    expect(lignes[2]).not.toHaveTextContent('·');
  });
});

describe('TCK-2908 (AC7) — « Agent principal · 1 collaborateur »', () => {
  const contact = { id: 8, name: 'Moussa Diallo', avatar_url: null, is_agent: true, member_since: null };
  const membre = (id: number, user_id: number, is_primary: boolean) => ({ id, user_id, role: 'agent', is_primary, user: { id: user_id, name: `Agent ${user_id}`, email: null } });

  it('un collaborateur en plus de l’agent principal : « Agent principal · 1 collaborateur »', () => {
    render(withIntl(<BlocResponsable property={bien(occupation(), { primary_contact: contact, primary_contact_source: 'designated', collaborators: [membre(1, 8, true), membre(2, 12, false)] })} />));
    expect(screen.getByText('Agent principal · 1 collaborateur')).toBeInTheDocument();
  });

  it('deux de plus : « 2 collaborateurs » ; aucun : « Agent principal » seul', () => {
    const { unmount } = render(withIntl(<BlocResponsable property={bien(occupation(), { primary_contact: contact, primary_contact_source: 'designated', collaborators: [membre(1, 8, true), membre(2, 12, false), membre(3, 13, false)] })} />));
    expect(screen.getByText('Agent principal · 2 collaborateurs')).toBeInTheDocument();
    unmount();
    render(withIntl(<BlocResponsable property={bien(occupation(), { primary_contact: contact, primary_contact_source: 'designated', collaborators: [membre(1, 8, true)] })} />));
    expect(screen.getByText('Agent principal')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('collaborateur');
  });
});
