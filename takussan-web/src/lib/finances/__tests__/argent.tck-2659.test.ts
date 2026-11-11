/**
 * TCK-2659 — le mois et la vue de « Argent », lus de l'adresse : fonctions pures.
 */
import { describe, expect, it } from 'vitest';

import { bornesDuMois, dateDuMois, derniersMois, estMois, moisCourant, moisPrecedent } from '../mois';
import { bornesDesEncaissements, estOngletArgent, moisAffiche, vueDeLArgent } from '../vue-argent';

const q = (s: string) => new URLSearchParams(s);

describe('mois (TCK-2659)', () => {
  it('reconnaît `AAAA-MM` et rien d’autre', () => {
    expect(estMois('2026-10')).toBe(true);
    for (const v of ['2026-13', '2026-1', '2026-10-01', 'octobre', '', null, undefined]) expect(estMois(v)).toBe(false);
  });

  it('le mois courant se lit à Dakar', () => {
    expect(moisCourant(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10');
    expect(moisCourant(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11');
  });

  it('le mois précédent passe l’année', () => {
    expect(moisPrecedent('2026-11')).toBe('2026-10');
    expect(moisPrecedent('2027-01')).toBe('2026-12');
  });

  it('les bornes d’un mois vont du premier au dernier jour, février bissextile compris', () => {
    expect(bornesDuMois('2026-10')).toEqual({ du: '2026-10-01', au: '2026-10-31' });
    expect(bornesDuMois('2028-02')).toEqual({ du: '2028-02-01', au: '2028-02-29' });
    expect(bornesDuMois('2026-02')).toEqual({ du: '2026-02-01', au: '2026-02-28' });
  });

  it('douze mois, du courant vers le passé', () => {
    const liste = derniersMois('2026-03');
    expect(liste).toHaveLength(12);
    expect(liste[0]).toBe('2026-03');
    expect(liste[3]).toBe('2025-12');
    expect(liste[11]).toBe('2025-04');
  });

  it('la date d’un mois tombe au milieu du mois (aucun fuseau ne la fait changer de mois)', () => {
    expect(dateDuMois('2026-10').toISOString()).toBe('2026-10-15T12:00:00.000Z');
  });
});

describe('vue de « Argent » (TCK-2659)', () => {
  it('sans `tab` ni entité : le point du mois', () => {
    expect(vueDeLArgent(q(''))).toEqual({ sorte: 'point' });
    expect(vueDeLArgent(q('period=2026-10'))).toEqual({ sorte: 'point' });
    expect(vueDeLArgent(q('tab=inconnu'))).toEqual({ sorte: 'point' });
  });

  it('un onglet connu ouvre son registre', () => {
    expect(vueDeLArgent(q('tab=impayes'))).toEqual({ sorte: 'registre', onglet: 'impayes' });
    expect(estOngletArgent('a-approuver')).toBe(true);
  });

  it('AC6 — un lien d’entité (type ET identifiant) ouvre les encaissements', () => {
    expect(vueDeLArgent(q('entity_type=lease&entity_id=3'))).toEqual({ sorte: 'registre', onglet: 'encaissements' });
    expect(vueDeLArgent(q('entity_type=lease'))).toEqual({ sorte: 'point' });
  });

  it('le mois affiché : `period` valide, sinon le courant', () => {
    expect(moisAffiche(q('period=2026-10'), '2026-11')).toBe('2026-10');
    expect(moisAffiche(q('period=n-importe'), '2026-11')).toBe('2026-11');
  });

  it('les bornes : « Du / Au » explicites > `period` > entité (sans borne) > mois courant', () => {
    expect(bornesDesEncaissements(q('date_from=2026-01-01&date_to=2026-03-31&period=2026-10'), '2026-11')).toEqual({ du: '2026-01-01', au: '2026-03-31', mois: null });
    expect(bornesDesEncaissements(q('period=2026-10&entity_type=lease&entity_id=3'), '2026-11')).toEqual({ du: '2026-10-01', au: '2026-10-31', mois: '2026-10' });
    expect(bornesDesEncaissements(q('entity_type=lease&entity_id=3'), '2026-11')).toEqual({ mois: null });
    expect(bornesDesEncaissements(q(''), '2026-11')).toEqual({ du: '2026-11-01', au: '2026-11-30', mois: '2026-11' });
  });
});
