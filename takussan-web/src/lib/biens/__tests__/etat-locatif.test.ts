import { describe, expect, it } from 'vitest';

import type { OccupationDuBien, PropertyListItem } from '@/types/property';

import { etatDuMois, ligneOccupant, loyerDuBien, publicationProposee } from '../etat-locatif';

/**
 * TCK-2638 — ce que la ligne du mode Gestion dit d'un bien : qui l'occupe, l'état du mois, le loyer
 * AVEC sa période (AC7). Lu du bloc `occupancy` de TCK-2637, sans rien recalculer du métier.
 */
const AUJOURDHUI = new Date('2026-11-12T10:00:00Z');

function bien(plus: Partial<PropertyListItem> = {}, occupancy?: Partial<OccupationDuBien> | null): PropertyListItem {
  return {
    id: 1,
    reference_number: 'PR-1',
    title: 'Appartement F3',
    slug: 'appartement-f3',
    price: 670_000,
    currency: 'XOF',
    type: 'apartment',
    contract_type: 'rent',
    rent_period: 'monthly',
    status: 'rented',
    visibility: 'public',
    location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: 'SN', latitude: null, longitude: null },
    bedrooms: null,
    bathrooms: null,
    area: null,
    furnished: false,
    featured: false,
    main_photo_url: null,
    ...plus,
    occupancy:
      occupancy === null
        ? null
        : occupancy === undefined
          ? undefined
          : {
              state: 'occupied',
              vacant_since: null,
              lease: null,
              tenant: null,
              rent: null,
              current_month: null,
              ...occupancy,
            },
  } as PropertyListItem;
}

const BAIL = { id: 47, reference_number: 'LS-1', type: 'residential_rent', status: 'active', start_date: '2026-07-01', end_date: '2027-06-30' };
const AMINATA = { id: 4, first_name: 'Aminata', last_name: 'Diop', phone: '+221770000000' };

describe('ligneOccupant', () => {
  it('occupé : le locataire et la fin du bail', () => {
    expect(ligneOccupant(bien({}, { lease: BAIL, tenant: AMINATA }), AUJOURDHUI)).toEqual({
      cle: 'locataire',
      nom: 'Aminata Diop',
      fin: '2027-06-30',
    });
  });

  it('occupé sans droit sur le bail (bloc tenant absent) : « Occupé », sans nom', () => {
    expect(ligneOccupant(bien({}, { tenant: null, lease: null }), AUJOURDHUI)).toEqual({ cle: 'occupe' });
  });

  it('vacant, qu’il ait déjà été loué ou non : « Sans locataire »', () => {
    expect(ligneOccupant(bien({}, { state: 'vacant', vacant_since: '2026-10-20' }), AUJOURDHUI)).toEqual({ cle: 'sansLocataire' });
    expect(ligneOccupant(bien({}, { state: 'vacant', vacant_since: null }), AUJOURDHUI)).toEqual({ cle: 'sansLocataire' });
  });

  it('à vendre : « À vendre », jamais « vacant »', () => {
    expect(ligneOccupant(bien({ contract_type: 'sale' }, { state: 'vacant' }), AUJOURDHUI)).toEqual({ cle: 'aVendre' });
  });

  it('sans bloc d’occupation : rien', () => {
    expect(ligneOccupant(bien(), AUJOURDHUI)).toBeNull();
  });
});

describe('etatDuMois', () => {
  it('payé', () => {
    expect(etatDuMois(bien({}, { lease: BAIL, current_month: { status: 'paid', due_date: '2026-11-05', days_late: null, amount_due: 0, late_fee_outstanding: null } }), AUJOURDHUI)).toEqual({
      ton: 'succes',
      cle: 'paye',
    });
  });

  it('en retard de N jours, en rouge', () => {
    expect(etatDuMois(bien({}, { lease: BAIL, current_month: { status: 'late', due_date: '2026-11-05', days_late: 7, amount_due: 670_000, late_fee_outstanding: null } }), AUJOURDHUI)).toEqual({
      ton: 'danger',
      cle: 'enRetard',
      jours: 7,
    });
  });

  it('payé en partie, et à échéance', () => {
    expect(etatDuMois(bien({}, { lease: BAIL, current_month: { status: 'partial', due_date: '2026-11-05', days_late: null, amount_due: 100, late_fee_outstanding: null } }), AUJOURDHUI)?.cle).toBe('partiel');
    expect(etatDuMois(bien({}, { lease: BAIL, current_month: { status: 'due', due_date: '2026-11-15', days_late: null, amount_due: 100, late_fee_outstanding: null } }), AUJOURDHUI)).toEqual({
      ton: 'neutre',
      cle: 'aEcheance',
      date: '2026-11-15',
    });
  });

  it('préavis : la sortie, à la fin du bail', () => {
    expect(etatDuMois(bien({}, { state: 'notice', lease: BAIL }), AUJOURDHUI)).toEqual({ ton: 'info', cle: 'preavis', date: '2027-06-30' });
  });

  it('vacant depuis N jours, en ambre ; jamais loué : « Vacant »', () => {
    expect(etatDuMois(bien({}, { state: 'vacant', vacant_since: '2026-10-20' }), AUJOURDHUI)).toEqual({ ton: 'avertissement', cle: 'vacantDepuis', jours: 23 });
    expect(etatDuMois(bien({}, { state: 'vacant', vacant_since: null }), AUJOURDHUI)).toEqual({ ton: 'avertissement', cle: 'vacant' });
  });

  it('un bien à vendre, ou sans échéance ce mois-ci, n’a pas d’état du mois', () => {
    expect(etatDuMois(bien({ contract_type: 'sale' }, { state: 'vacant' }), AUJOURDHUI)).toBeNull();
    expect(etatDuMois(bien({}, { lease: BAIL, current_month: { status: 'none', due_date: null, days_late: null, amount_due: null, late_fee_outstanding: null } }), AUJOURDHUI)).toBeNull();
    expect(etatDuMois(bien(), AUJOURDHUI)).toBeNull();
  });
});

describe('loyerDuBien (AC7 : jamais un loyer sans sa période)', () => {
  it('le loyer du bail courant, à sa fréquence', () => {
    expect(loyerDuBien(bien({}, { rent: { amount: 650_000, charges: null, currency: 'XOF', payment_frequency: 'quarterly' } }))).toEqual({
      montant: 650_000,
      devise: 'XOF',
      periode: 'quarterly',
    });
  });

  it('sans bail : le prix de l’annonce, à sa période', () => {
    expect(loyerDuBien(bien({ rent_period: 'weekly' }, { state: 'vacant' }))).toEqual({ montant: 670_000, devise: 'XOF', periode: 'weekly' });
  });

  it('un bien à louer sans période déclarée se lit au mois, la période par défaut de l’annonce', () => {
    expect(loyerDuBien(bien({ rent_period: null }, { state: 'vacant' }))?.periode).toBe('monthly');
  });

  it('un prix de vente n’a pas de période', () => {
    expect(loyerDuBien(bien({ contract_type: 'sale', price: 98_000_000 }))).toEqual({ montant: 98_000_000, devise: 'XOF', periode: null });
  });
});

describe('publicationProposee', () => {
  it('un bien vacant à louer, hors ligne : « Publier l’annonce »', () => {
    expect(publicationProposee(bien({ is_online: false }, { state: 'vacant' }))).toBe(true);
  });

  it('ni en ligne, ni occupé, ni à vendre', () => {
    expect(publicationProposee(bien({ is_online: true }, { state: 'vacant' }))).toBe(false);
    expect(publicationProposee(bien({ is_online: false }, { state: 'occupied' }))).toBe(false);
    expect(publicationProposee(bien({ is_online: false, contract_type: 'sale' }, { state: 'vacant' }))).toBe(false);
  });
});
