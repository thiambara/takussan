/**
 * TCK-2594 — les règles de la liste des réservations : quelle nature et quel statut s'ouvrent, le
 * montant dans les mots de la nature, l'âge d'une demande, les groupes du client.
 */
import { describe, expect, it } from 'vitest';

import {
  ageDeLaDemande,
  comptesVides,
  type ComptesDesReservations,
  groupeDuClient,
  montantDansLaNature,
  natureDeLUrl,
  natureOuverte,
  nuitsEntre,
  statutDeLUrl,
  statutOuvert,
  STATUTS_DU_GROUPE,
} from '../liste-des-reservations';

function comptes(partiel: Partial<Record<keyof ComptesDesReservations, Partial<ComptesDesReservations['stay']>>>): ComptesDesReservations {
  const c = comptesVides();
  for (const [nature, statuts] of Object.entries(partiel)) {
    Object.assign(c[nature as keyof ComptesDesReservations], statuts);
  }
  return c;
}

describe('natureDeLUrl / statutDeLUrl', () => {
  it('ne lit que les valeurs connues', () => {
    expect(natureDeLUrl('offer')).toBe('offer');
    expect(natureDeLUrl('sejour')).toBeNull();
    expect(natureDeLUrl(null)).toBeNull();
    expect(statutDeLUrl('completed')).toBe('completed');
    expect(statutDeLUrl('tout')).toBeNull();
  });
});

describe('natureOuverte', () => {
  it('suit l’URL quand elle en porte une', () => {
    expect(natureOuverte('offer', comptes({ stay: { pending: 4 } }))).toBe('offer');
  });

  it('attend les comptes quand l’URL n’en porte pas', () => {
    expect(natureOuverte(null, null)).toBeNull();
  });

  it('ouvre la première nature qui a une demande à décider', () => {
    expect(natureOuverte(null, comptes({ stay: { confirmed: 2 }, application: { completed: 3 }, offer: { pending: 1 } }))).toBe('offer');
  });

  it('à défaut, la première nature non vide ; à défaut, Séjours', () => {
    expect(natureOuverte(null, comptes({ application: { completed: 3 }, offer: { expired: 1 } }))).toBe('application');
    expect(natureOuverte(null, comptesVides())).toBe('stay');
  });

  it('des comptes illisibles ouvrent Séjours plutôt qu’une page qui attend toujours', () => {
    expect(natureOuverte(null, null, true)).toBe('stay');
  });
});

describe('statutOuvert', () => {
  it('suit l’URL, même vide : le lien « À décider » du bailleur y reste', () => {
    expect(statutOuvert('pending', comptes({}).stay)).toBe('pending');
  });

  it('ouvre « À décider » quand elle a des demandes, sinon « Confirmées »', () => {
    expect(statutOuvert(null, comptes({ stay: { pending: 1, confirmed: 2 } }).stay)).toBe('pending');
    expect(statutOuvert(null, comptes({ stay: { confirmed: 2 } }).stay)).toBe('confirmed');
  });

  it('attend les comptes, sauf illisibles', () => {
    expect(statutOuvert(null, null)).toBeNull();
    expect(statutOuvert(null, null, true)).toBe('pending');
  });
});

describe('montantDansLaNature', () => {
  it('un séjour compte ses nuits', () => {
    expect(montantDansLaNature({ kind: 'stay', total_amount: 165000, start_date: '2026-11-12', end_date: '2026-11-15' })).toEqual({ forme: 'nuits', nuits: 3, montant: 165000 });
  });

  it('une candidature dit le loyer, une offre le prix offert et son écart au prix affiché', () => {
    expect(montantDansLaNature({ kind: 'application', total_amount: 250000 })).toEqual({ forme: 'loyer', montant: 250000 });
    expect(montantDansLaNature({ kind: 'offer', total_amount: 85_000_000, list_price_at_booking: 95_000_000 })).toEqual({
      forme: 'offre',
      montant: 85_000_000,
      affiche: 95_000_000,
      ecart: (85_000_000 - 95_000_000) / 95_000_000,
    });
  });

  it('sans nature lue, ni dates, le montant reste nu', () => {
    expect(montantDansLaNature({ total_amount: 1000 })).toEqual({ forme: 'montant', montant: 1000 });
    expect(montantDansLaNature({ kind: 'stay', total_amount: 1000, start_date: null, end_date: null })).toEqual({ forme: 'montant', montant: 1000 });
  });
});

describe('nuitsEntre', () => {
  it('compte en jours civils, heure et fuseau ignorés', () => {
    expect(nuitsEntre('2026-11-12T14:00:00+00:00', '2026-11-15T10:00:00+00:00')).toBe(3);
    expect(nuitsEntre('2026-11-15', '2026-11-12')).toBeNull();
  });
});

describe('ageDeLaDemande', () => {
  const maintenant = new Date('2026-11-12T12:00:00Z');
  it('en minutes, en heures, hier, en jours, puis la date', () => {
    expect(ageDeLaDemande('2026-11-12T11:40:00Z', maintenant)).toEqual({ unite: 'min', n: 20 });
    expect(ageDeLaDemande('2026-11-12T10:00:00Z', maintenant)).toEqual({ unite: 'h', n: 2 });
    expect(ageDeLaDemande('2026-11-11T09:00:00Z', maintenant)).toEqual({ unite: 'hier', n: 1 });
    expect(ageDeLaDemande('2026-11-08T12:00:00Z', maintenant)).toEqual({ unite: 'j', n: 4 });
    expect(ageDeLaDemande('2026-10-01T12:00:00Z', maintenant)).toEqual({ unite: 'date', n: 0 });
  });
});

describe('les groupes du client', () => {
  it('En cours, Terminées, Annulées couvrent les six statuts, chacun une fois', () => {
    const tous = Object.values(STATUTS_DU_GROUPE).flat();
    expect(new Set(tous).size).toBe(6);
    expect(groupeDuClient('rejected')).toBe('annulees');
    expect(groupeDuClient('pending')).toBe('en_cours');
  });
});
