/**
 * TCK-2639 — la fiche du bien, « Location d'abord ». Les lectures sont bouchonnées au niveau des hooks
 * (le bail, ses échéances, son état des lieux, les documents, les interventions) : ce que ce fichier
 * éprouve, c'est ce que la fiche DIT de ces données et quels gestes elle offre, à qui.
 *
 *  · bien occupé en retard (AC1), payé, bailleur sans gestes du personnel (AC7) ;
 *  · bien vacant (AC2), jamais loué, à vendre ;
 *  · compteurs d'onglet égaux aux lignes rendues (AC4) ;
 *  · la barre du téléphone : deux gestes au plus (AC5).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PaymentHistoryRow } from '@/types/invoice';
import type { OccupationDuBien, PropertyDetail } from '@/types/property';

const etat = vi.hoisted(() => ({
  bail: null as null | { data: Record<string, unknown> },
  echeances: [] as unknown[],
  edl: [] as unknown[],
  interventions: 0,
  deposesBien: [] as unknown[],
  deposesBail: [] as unknown[],
  generes: [] as unknown[],
  personnelActif: false,
  bailEnLecture: false,
  relance: vi.fn(),
  encaisser: vi.fn(),
  search: '',
}));

const succes = (data: unknown) => ({ data, isSuccess: true, isPending: false, isError: false, refetch: vi.fn() });

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(etat.search),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/lib/queries/leases', () => ({
  useLease: (id: number | null) => (id && !etat.bailEnLecture ? succes(etat.bail) : { data: undefined, isPending: true, isError: false }),
}));
vi.mock('@/lib/queries/payments', () => ({
  usePaymentsHistory: (p: { enabled?: boolean }) =>
    p.enabled === false ? { data: undefined, isPending: true, isError: false } : succes({ data: etat.echeances, meta: { total: etat.echeances.length } }),
}));
vi.mock('@/lib/queries/inventory', () => ({ useInventories: () => succes({ data: etat.edl }) }));
vi.mock('@/lib/queries/maintenance', () => ({
  useMaintenanceHistoryForProperty: () => succes({ data: [], meta: { total: etat.interventions } }),
}));
vi.mock('@/lib/queries/documents', () => ({
  useDocuments: (p: { documentable_type: string; enabled?: boolean }) =>
    p.enabled === false
      ? { data: undefined, isPending: true, isSuccess: false, isError: false, refetch: vi.fn() }
      : succes({ data: p.documentable_type === 'lease' ? etat.deposesBail : etat.deposesBien }),
  useDocumentsGeneres: () => succes({ data: etat.generes }),
}));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => etat.personnelActif }));
vi.mock('@/components/admin/finances/impayes/Impayes', () => ({
  FeuilleDeRelance: ({ row, ouverte }: { row: PaymentHistoryRow; ouverte: boolean }) => {
    etat.relance(row.id, ouverte);
    return ouverte ? <div data-testid="feuille-de-relance">{row.id}</div> : null;
  },
}));
vi.mock('@/components/leases/LeasePaymentDialog', () => ({
  LeasePaymentDialog: ({ open, leaseId, paiementInitial }: { open: boolean; leaseId: number; paiementInitial?: number }) => {
    if (open) etat.encaisser(leaseId, paiementInitial);
    return null;
  },
}));
vi.mock('@/components/visits/PlanifierUneVisite', () => ({ PlanifierDialog: () => null }));
vi.mock('@/components/documents/AddDocumentButton', () => ({
  AddDocumentButton: ({ documentableType, documentableId }: { documentableType: string; documentableId: number }) => (
    <button type="button" data-testid="ajouter-un-document">{`${documentableType}:${documentableId}`}</button>
  ),
}));
vi.mock('@/components/property-form/PropertyForm', () => ({ PropertyForm: () => null }));
vi.mock('@/components/property-dashboard/PropertyMediaPanel', () => ({ PropertyMediaPanel: () => null }));
vi.mock('@/components/property-dashboard/PropertyOverviewPanel', () => ({ PropertyOverviewPanel: () => <div data-testid="apercu-annonce" /> }));
vi.mock('@/components/property-dashboard/PropertyCollaboratorsPanel', () => ({ PropertyCollaboratorsPanel: () => null }));
vi.mock('@/components/contact/ContactsSurPlaceDuBien', () => ({ ContactsSurPlaceDuBien: () => null }));
vi.mock('@/components/maintenance/MaintenanceHistoryByProperty', () => ({ MaintenanceHistoryByProperty: () => null }));

const { OngletLocation } = await import('../OngletLocation');
const { CarteOccupation } = await import('../CarteOccupation');
const { gestesDeLaBarre, BarreDuBien } = await import('../BarreDuBien');
const { PropertyDetailTabs } = await import('../../PropertyDetailTabs');
const { BlocResponsable } = await import('../PiecesDeLaLocation');

const AUJOURDHUI = new Date();
const ilYA = (jours: number) => new Date(AUJOURDHUI.getTime() - jours * 86_400_000).toISOString().slice(0, 10);

const occupe = (mois: Partial<NonNullable<OccupationDuBien['current_month']>>): OccupationDuBien => ({
  state: 'occupied',
  vacant_since: null,
  lease: { id: 7, reference_number: 'LS-7KQ2', type: 'residential_rent', status: 'active', start_date: '2026-07-01', end_date: '2029-06-30' },
  tenant: { id: 3, first_name: 'Mariama', last_name: 'Sow', phone: '+221776124085' },
  rent: { amount: 1_355_000, charges: null, currency: 'XOF', payment_frequency: 'monthly' },
  current_month: { status: 'late', due_date: '2026-11-05', days_late: 6, amount_due: 1_422_750, late_fee_outstanding: 67_750, ...mois },
});

const bien = (occupancy: OccupationDuBien | null, extra: Partial<PropertyDetail> = {}): PropertyDetail =>
  ({
    id: 9,
    title: 'Villa 5 chambres · Ouest Foire',
    contract_type: 'rent',
    rent_period: 'monthly',
    price: 1_355_000,
    currency: 'XOF',
    photos: [],
    price_history: [],
    owner: { id: 50, name: 'Mouhamed Sène' },
    owner_profile_id: 31,
    agency: { id: 3, name: 'Agence Teranga' },
    is_online: false,
    occupancy,
    ...extra,
  }) as unknown as PropertyDetail;

const ligneDuMois = { id: 501, source: 'lease', due_date: '2026-11-05', amount: 1_355_000, currency: 'XOF', status: 'late', paid_amount: 0, remaining_amount: 1_355_000, days_late: 6, paid_at: null, payer: { id: 3, name: 'Mariama Sow', phone: '+221776124085' } };

beforeEach(() => {
  etat.bail = { data: { id: 7, deposit_amount: 2_710_000, currency: 'XOF', notice_period_days: 90, abilities: { record_payment: true } } };
  etat.echeances = [ligneDuMois];
  etat.edl = [];
  etat.interventions = 0;
  etat.deposesBien = [];
  etat.deposesBail = [];
  etat.generes = [];
  etat.personnelActif = false;
  etat.bailEnLecture = false;
  etat.search = '';
  etat.relance.mockClear();
  etat.encaisser.mockClear();
});

function location(property: PropertyDetail, personnel: boolean) {
  return render(withIntl(<OngletLocation property={property} personnel={personnel} lienVersLeBailleur onOuvrirLAnnonce={() => {}} />));
}

describe('TCK-2639 — l’onglet Location', () => {
  it('la période d’avant, réglée, se dit après la pénalité ; le loyer garde sa période', () => {
    etat.echeances = [ligneDuMois, { ...ligneDuMois, id: 500, due_date: '2026-10-05', status: 'paid', paid_amount: 1_355_000, remaining_amount: 0, days_late: null, paid_at: '2026-10-29T10:00:00Z' }];
    location(bien(occupe({})), true);
    const pile = screen.getByTestId('nom-du-locataire').closest('[data-slot="location-pile"]') as HTMLElement;
    expect(within(pile).getByText(/Pénalité de retard due/)).toHaveTextContent(/octobre payé le 29 oct\./);
    // Contraintes strictes : le loyer se dit toujours avec sa période.
    expect(within(pile).getAllByText(/\/ mois/).length).toBeGreaterThan(0);
  });

  it('CLS — tant que le bail se lit, la place de « Relancer » et « Encaisser » est tenue pour le personnel, et pour lui seul', () => {
    etat.bailEnLecture = true;
    const { container, unmount } = location(bien(occupe({})), true);
    expect(container.querySelector('[data-slot="gestes-en-lecture"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Encaisser/ })).toBeNull();
    unmount();
    const carte = render(withIntl(<CarteOccupation property={bien(occupe({}))} personnel lienVersLeBailleur />));
    expect(carte.container.querySelector('[data-slot="encaisser-en-lecture"]')).not.toBeNull();
    carte.unmount();

    const bailleur = location(bien(occupe({})), false);
    expect(bailleur.container.querySelector('[data-slot="gestes-en-lecture"]')).toBeNull();
  });

  it('AC1 — en retard de 6 j : le locataire, le bail en lien, le retard et la pénalité ; « Relancer » ouvre la relance de l’échéance du mois', async () => {
    location(bien(occupe({})), true);
    const pile = screen.getByTestId('nom-du-locataire').closest('[data-slot="location-pile"]') as HTMLElement;
    expect(within(pile).getByTestId('nom-du-locataire')).toHaveTextContent('Mariama Sow');
    expect(within(pile).getByRole('link', { name: /Bail LS-7KQ2/ })).toHaveAttribute('href', '/app/leases/7');
    expect(within(pile).getByTestId('etat-du-mois')).toHaveTextContent('En retard de 6 j');
    expect(within(pile).getByText(/Pénalité de retard due/)).toHaveTextContent('67');
    // Le numéro du locataire : Appeler et WhatsApp.
    expect(within(pile).getByRole('link', { name: 'Écrire à Mariama Sow sur WhatsApp' })).toHaveAttribute('href', 'https://wa.me/221776124085?text=');

    fireEvent.click(within(pile).getByRole('button', { name: /Relancer/ }));
    expect(await screen.findByTestId('feuille-de-relance')).toHaveTextContent('501');

    fireEvent.click(within(pile).getByRole('button', { name: /Encaisser/ }));
    expect(etat.encaisser).toHaveBeenCalledWith(7, 501);
  });

  it('payé : « Payé » et la date ; ni « Relancer » ni « Encaisser »', () => {
    etat.echeances = [{ ...ligneDuMois, status: 'paid', paid_amount: 1_355_000, remaining_amount: 0, days_late: null, paid_at: '2026-11-04T10:00:00Z' }];
    location(bien(occupe({ status: 'paid', days_late: null, amount_due: 0, late_fee_outstanding: 0 })), true);
    const pile = screen.getByTestId('nom-du-locataire').closest('[data-slot="location-pile"]') as HTMLElement;
    expect(within(pile).getByTestId('etat-du-mois')).toHaveTextContent('Payé');
    expect(within(pile).getByText(/Payé le/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Relancer|Encaisser/ })).toBeNull();
  });

  it('AC7 — le bailleur voit son locataire ; sans `record_payment`, ni « Encaisser » ni « Relancer »', () => {
    etat.bail = { data: { id: 7, abilities: { record_payment: false } } };
    location(bien(occupe({})), false);
    expect(screen.getAllByTestId('nom-du-locataire')[0]).toHaveTextContent('Mariama Sow');
    expect(screen.queryByRole('button', { name: /Relancer|Encaisser/ })).toBeNull();
  });

  it('TCK-2645 (décision 2) — le bailleur à qui l’API accorde l’encaissement a « Encaisser », jamais « Relancer »', () => {
    // `LeasePolicy::recordPayment` : le bailleur qui écrit sur son bail encaisse (TCK-587) ; la fiche
    // suit `abilities.record_payment`, comme celle du bail. La relance reste un geste du personnel.
    location(bien(occupe({})), false);
    const pile = screen.getByTestId('nom-du-locataire').closest('[data-slot="location-pile"]') as HTMLElement;
    fireEvent.click(within(pile).getByRole('button', { name: /Encaisser/ }));
    expect(etat.encaisser).toHaveBeenCalledWith(7, 501);
    expect(screen.queryByRole('button', { name: /Relancer/ })).toBeNull();
  });

  it('le personnel sans le droit d’encaisser sur ce bail n’a pas les gestes (l’API en juge)', () => {
    etat.bail = { data: { id: 7, abilities: { record_payment: false } } };
    location(bien(occupe({})), true);
    expect(screen.queryByRole('button', { name: /Relancer|Encaisser/ })).toBeNull();
  });

  it('AC2 — vacant : « Vacant depuis N j », « Créer un bail » vers le bien préchoisi, « Publier l’annonce » hors ligne', () => {
    location(bien({ state: 'vacant', vacant_since: ilYA(12), lease: null, tenant: null, rent: null, current_month: null }), true);
    expect(screen.getByTestId('etat-vacant')).toHaveTextContent('Vacant depuis 12 j');
    expect(screen.getByRole('link', { name: /Créer un bail/ })).toHaveAttribute('href', '/app/leases/new?property=9');
    expect(screen.getByRole('button', { name: /Publier l’annonce/ })).toBeInTheDocument();
  });

  it('jamais loué : « Sans locataire », et pas de « Publier » pour un bien déjà en ligne', () => {
    location(bien({ state: 'vacant', vacant_since: null, lease: null, tenant: null, rent: null, current_month: null }, { is_online: true }), true);
    expect(screen.getByTestId('etat-vacant')).toHaveTextContent('Sans locataire');
    expect(screen.queryByRole('button', { name: /Publier l’annonce/ })).toBeNull();
  });

  it('à vendre : la location renvoie à l’annonce', () => {
    location(bien({ state: 'not_rental', vacant_since: null, lease: null, tenant: null, rent: null, current_month: null }, { contract_type: 'sale' }), true);
    expect(screen.getByText('Bien à vendre')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ouvrir l’annonce' })).toBeInTheDocument();
  });

  it('le bureau liste les dernières échéances, et le bail en cours (caution, préavis)', () => {
    location(bien(occupe({})), true);
    const bureau = document.querySelector('[data-slot="location-bureau"]') as HTMLElement;
    expect(within(bureau).getAllByTestId('ligne-d-echeance')).toHaveLength(1);
    expect(within(bureau).getByText('Préavis').nextSibling).toHaveTextContent('90 jours');
    expect(within(bureau).getByText('Caution').nextSibling).toHaveTextContent(/2\s?710\s?000/);
  });
});

describe('TCK-2639 — la carte « Occupation » (bureau)', () => {
  it('le personnel y encaisse ; « Voir le bail » et « Signaler un problème » mènent au bail et à la demande du bien', () => {
    render(withIntl(<CarteOccupation property={bien(occupe({}))} personnel lienVersLeBailleur />));
    expect(screen.getByRole('button', { name: /Encaisser/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir le bail' })).toHaveAttribute('href', '/app/leases/7');
    expect(screen.getByRole('link', { name: 'Signaler un problème' })).toHaveAttribute('href', '/app/maintenance/new?property=9');
    expect(screen.getByRole('link', { name: 'Mouhamed Sène' })).toHaveAttribute('href', '/app/owners/31');
  });

  it('AC7 — le bailleur sans `record_payment` n’y a pas « Encaisser », et son nom n’y mène nulle part sans la fiche du bailleur', () => {
    etat.bail = { data: { id: 7, abilities: { record_payment: false } } };
    render(withIntl(<CarteOccupation property={bien(occupe({}))} personnel={false} lienVersLeBailleur={false} />));
    expect(screen.queryByRole('button', { name: /Encaisser/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Mouhamed Sène' })).toBeNull();
    expect(screen.getByText('Mariama Sow')).toBeInTheDocument();
  });
});

describe('TCK-2639 — les onglets', () => {
  it('« Location » s’ouvre par défaut sur un bien à louer, « Annonce » sur un bien à vendre', () => {
    const { unmount } = render(withIntl(<PropertyDetailTabs property={bien(occupe({}))} tags={[]} personnel />));
    expect(screen.getByRole('tab', { name: /Location/ })).toHaveAttribute('aria-selected', 'true');
    unmount();
    render(withIntl(<PropertyDetailTabs property={bien(null, { contract_type: 'sale' })} tags={[]} />));
    expect(screen.getByRole('tab', { name: /Annonce/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('apercu-annonce')).toBeInTheDocument();
  });

  it('AC4 — chaque compteur égale ce que son onglet rend', () => {
    etat.interventions = 3;
    etat.deposesBien = [{ id: 1, name: 'Titre foncier', type: 'other', created_at: '2026-09-01T00:00:00Z', file_url: null }];
    etat.deposesBail = [{ id: 2, name: 'Attestation', type: 'other', created_at: '2026-09-02T00:00:00Z', file_url: null }];
    etat.generes = [{ kind: 'generated', category: 'lease_contract', title: 'LS-7KQ2', date: '2026-07-01', download_path: '/api/leases/7/contract/pdf' }];
    const prix = [
      { id: 1, old_price: 1_200_000, new_price: 1_300_000, changed_at: '2026-01-01' },
      { id: 2, old_price: 1_300_000, new_price: 1_355_000, changed_at: '2026-07-01' },
    ];
    etat.search = 'tab=documents';
    render(withIntl(<PropertyDetailTabs property={bien(occupe({}), { price_history: prix } as never)} tags={[]} personnel />));
    expect(screen.getByRole('tab', { name: /Interventions/ })).toHaveTextContent('Interventions3');
    expect(screen.getByRole('tab', { name: /Historique/ })).toHaveTextContent('Historique2');
    expect(screen.getByRole('tab', { name: /Documents/ })).toHaveTextContent('Documents3');
    // L'onglet Documents rend les pièces du bien ET de son bail, et le contrat généré : trois lignes.
    expect(screen.getAllByTestId('document-du-bien')).toHaveLength(3);
    expect(screen.getByText('Contrat de bail LS-7KQ2')).toBeInTheDocument();
    // AC3 — « Ajouter un document » est préattaché au bien.
    expect(screen.getByTestId('ajouter-un-document')).toHaveTextContent('property:9');
  });

  it('un lien d’avant TCK-2639 garde sa destination : `?tab=edit` ouvre l’annonce, section Édition', () => {
    etat.search = 'tab=edit';
    render(withIntl(<PropertyDetailTabs property={bien(occupe({}))} tags={[]} personnel />));
    expect(screen.getByRole('tab', { name: /Annonce/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Édition' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('TCK-2639 — la barre du téléphone (AC5)', () => {
  it('jamais plus de deux gestes, quel que soit le bien et l’appelant', () => {
    const vacant: OccupationDuBien = { state: 'vacant', vacant_since: null, lease: null, tenant: null, rent: null, current_month: null };
    const vente: OccupationDuBien = { state: 'not_rental', vacant_since: null, lease: null, tenant: null, rent: null, current_month: null };
    const injoignable = { ...occupe({}), tenant: { id: 3, first_name: 'Mariama', last_name: 'Sow', phone: null } };
    const masque = { ...occupe({}), tenant: null };
    expect(gestesDeLaBarre(bien(occupe({})), true)).toEqual(['signaler', 'contacter']);
    expect(gestesDeLaBarre(bien(vacant), true)).toEqual(['planifier', 'creerUnBail']);
    expect(gestesDeLaBarre(bien(vacant), false)).toEqual(['publier', 'creerUnBail']);
    expect(gestesDeLaBarre(bien(injoignable), true)).toEqual(['signaler', 'voirLeBail']);
    expect(gestesDeLaBarre(bien(masque), false)).toEqual(['signaler', 'voirLeBail']);
    expect(gestesDeLaBarre(bien(vente, { contract_type: 'sale' }), true)).toEqual(['planifier', 'modifierLAnnonce']);
    for (const o of [occupe({}), vacant, vente, injoignable, masque, null]) {
      for (const p of [true, false]) expect(gestesDeLaBarre(bien(o), p).length).toBeLessThanOrEqual(2);
    }
  });

  it('bien occupé : « Signaler un problème » + « Contacter le locataire », qui ouvre Appeler et WhatsApp', async () => {
    render(withIntl(<BarreDuBien property={bien(occupe({}))} onOuvrirLAnnonce={() => {}} />));
    const barre = screen.getByTestId('barre-du-bien');
    expect(within(barre).getAllByRole('link').length + within(barre).getAllByRole('button').length).toBe(2);
    expect(within(barre).getByRole('link', { name: /Signaler un problème/ })).toHaveAttribute('href', '/app/maintenance/new?property=9');
    fireEvent.click(within(barre).getByRole('button', { name: 'Contacter le locataire' }));
    expect(await screen.findByRole('link', { name: /Écrire sur WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/221776124085?text=');
  });
});

describe('TCK-2639 (TCK-603) — l’agent responsable, sous le bailleur', () => {
  it('nomme l’agent désigné ; « Non désigné » quand le contact n’est que le bailleur ; rien sans la source', () => {
    const { unmount } = render(withIntl(<BlocResponsable property={bien(occupe({}), { primary_contact: { id: 8, name: 'Moussa Diallo', avatar_url: null, is_agent: true, member_since: null }, primary_contact_source: 'designated' })} />));
    expect(screen.getByText('Moussa Diallo')).toBeInTheDocument();
    expect(screen.getByText('Agent responsable')).toBeInTheDocument();
    unmount();

    const repli = render(withIntl(<BlocResponsable property={bien(occupe({}), { primary_contact: { id: 50, name: 'Mouhamed Sène', avatar_url: null, is_agent: false, member_since: null }, primary_contact_source: 'owner' })} />));
    expect(screen.getByText('Non désigné')).toBeInTheDocument();
    expect(screen.queryByText('Mouhamed Sène')).toBeNull();
    repli.unmount();

    const { container } = render(withIntl(<BlocResponsable property={bien(occupe({}))} />));
    expect(container).toBeEmptyDOMElement();
  });
});
