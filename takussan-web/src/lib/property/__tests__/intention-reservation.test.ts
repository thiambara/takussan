import { describe, expect, it } from 'vitest';

import {
  cheminIntentionReservation,
  lireIntentionReservation,
  sansIntentionReservation,
} from '../intention-reservation';

describe('intention de réservation (TCK-589)', () => {
  it('aller-retour : le chemin produit se relit', () => {
    const chemin = cheminIntentionReservation('villa', { debut: '2099-01-10', fin: '2099-01-14' });
    expect(chemin).toBe('/properties/villa?action=reserver&debut=2099-01-10&fin=2099-01-14');
    expect(lireIntentionReservation(chemin.split('?')[1]!)).toEqual({ debut: '2099-01-10', fin: '2099-01-14' });
  });

  it('sans dates, l’intention reste une intention', () => {
    expect(cheminIntentionReservation('villa')).toBe('/properties/villa?action=reserver');
    expect(lireIntentionReservation('?action=reserver')).toEqual({ debut: '', fin: '' });
  });

  it.each([
    ['?debut=2099-01-10', null],
    ['?action=autre', null],
    ['?action=reserver&debut=10/01/2099&fin=2099-13-45', { debut: '', fin: '' }],
    ['?action=reserver&debut=2099-01-14&fin=2099-01-10', { debut: '2099-01-14', fin: '' }],
  ])('%s → %j', (recherche, attendu) => {
    expect(lireIntentionReservation(recherche)).toEqual(attendu);
  });

  // q1 de la contre-vérification de c3ab22af4 : `Date.parse` laissait passer « 2027-02-30 », que l'API
  // refuse (422, `JourIso`, TCK-2768). Un jour se juge comme l'API le juge (`estUnJourDeLApi`).
  it('un jour hors calendrier ou hors des années de l’API ne se pré-remplit pas', () => {
    expect(lireIntentionReservation('?action=reserver&debut=2027-02-30&fin=2027-03-02')).toEqual({ debut: '', fin: '2027-03-02' });
    expect(lireIntentionReservation('?action=reserver&debut=2027-04-31')).toEqual({ debut: '', fin: '' });
    expect(lireIntentionReservation('?action=reserver&debut=2200-01-01')).toEqual({ debut: '', fin: '' });
    expect(lireIntentionReservation('?action=reserver&debut=2028-02-29&fin=2028-03-01')).toEqual({ debut: '2028-02-29', fin: '2028-03-01' });
    expect(cheminIntentionReservation('villa', { debut: '2027-02-30', fin: '2027-03-02' })).toBe('/properties/villa?action=reserver&fin=2027-03-02');
  });

  it('retire l’intention et garde le reste de l’URL', () => {
    expect(sansIntentionReservation('https://takussan.com/fr/properties/v?action=reserver&debut=2099-01-10&ref=wa#avis')).toBe(
      '/fr/properties/v?ref=wa#avis',
    );
  });
});
