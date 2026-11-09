import { describe, expect, it } from 'vitest';

import {
  choisirJour,
  grilleDuMois,
  jourSelectionnable,
  nombreDeNuits,
  nuitPrise,
  selectionComplete,
  selectionTenable,
  SELECTION_VIDE,
  type ContexteDuCalendrier,
} from '../calendrier-des-nuits';

/**
 * TCK-2510 — les règles du calendrier des nuits. Plage occupée du 10 au 13 décembre : `[10, 13)`,
 * le 13 est le jour de départ d'un autre séjour (TCK-596).
 */
const contexte: ContexteDuCalendrier = {
  aujourdhui: '2026-12-01',
  plages: [{ start: '2026-12-10', end: '2026-12-13' }],
};

describe('calendrier des nuits (TCK-2510)', () => {
  it('AC1 — les nuits du 10, 11 et 12 sont barrées, ni celle du 9 ni celle du 13', () => {
    expect(['09', '10', '11', '12', '13'].map((j) => nuitPrise(`2026-12-${j}`, contexte.plages))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
  });

  it('AC1 — une sélection du 9 au 11 est refusée : le 11 ne devient pas le départ', () => {
    const arrivee9 = choisirJour(SELECTION_VIDE, '2026-12-09', contexte);
    expect(arrivee9).toEqual({ arrivee: '2026-12-09', depart: null });

    expect(jourSelectionnable(arrivee9, '2026-12-11', contexte)).toBe(false);
    expect(choisirJour(arrivee9, '2026-12-11', contexte)).toEqual(arrivee9);
    // Ni le 12, ni au-delà de la plage : le séjour franchirait les nuits prises.
    expect(jourSelectionnable(arrivee9, '2026-12-12', contexte)).toBe(false);
    expect(jourSelectionnable(arrivee9, '2026-12-14', contexte)).toBe(false);
    expect(choisirJour(arrivee9, '2026-12-14', contexte)).toEqual(arrivee9);
  });

  it('un départ le 10 reste possible : on part le jour où un autre arrive', () => {
    const arrivee9 = choisirJour(SELECTION_VIDE, '2026-12-09', contexte);
    expect(jourSelectionnable(arrivee9, '2026-12-10', contexte)).toBe(true);
    expect(choisirJour(arrivee9, '2026-12-10', contexte)).toEqual({ arrivee: '2026-12-09', depart: '2026-12-10' });
  });

  it('AC1 — une arrivée le 13 est possible, et un séjour du 13 au 15 se choisit', () => {
    expect(jourSelectionnable(SELECTION_VIDE, '2026-12-13', contexte)).toBe(true);
    const arrivee13 = choisirJour(SELECTION_VIDE, '2026-12-13', contexte);
    expect(choisirJour(arrivee13, '2026-12-15', contexte)).toEqual({ arrivee: '2026-12-13', depart: '2026-12-15' });
  });

  it('une nuit prise ne peut pas être une arrivée, ni un jour passé', () => {
    expect(jourSelectionnable(SELECTION_VIDE, '2026-12-10', contexte)).toBe(false);
    expect(jourSelectionnable(SELECTION_VIDE, '2026-12-12', contexte)).toBe(false);
    expect(jourSelectionnable(SELECTION_VIDE, '2026-11-30', contexte)).toBe(false);
    expect(jourSelectionnable(SELECTION_VIDE, '2026-12-01', contexte)).toBe(true);
  });

  it('un jour avant l’arrivée recommence la sélection ; une sélection complète aussi', () => {
    const arrivee5 = choisirJour(SELECTION_VIDE, '2026-12-05', contexte);
    expect(choisirJour(arrivee5, '2026-12-03', contexte)).toEqual({ arrivee: '2026-12-03', depart: null });
    expect(choisirJour(arrivee5, '2026-12-05', contexte)).toEqual({ arrivee: '2026-12-05', depart: null });
    // Sans nuit prise entre les deux, un jour plus tard est un départ.
    expect(choisirJour(arrivee5, '2026-12-08', contexte)).toEqual({ arrivee: '2026-12-05', depart: '2026-12-08' });
    const complete = { arrivee: '2026-12-05', depart: '2026-12-08' };
    expect(choisirJour(complete, '2026-12-20', contexte)).toEqual({ arrivee: '2026-12-20', depart: null });
  });

  it('selectionComplete refuse un séjour qui chevauche une nuit prise, ou passé', () => {
    expect(selectionComplete({ arrivee: '2026-12-09', depart: '2026-12-10' }, contexte)).toBe(true);
    expect(selectionComplete({ arrivee: '2026-12-09', depart: '2026-12-11' }, contexte)).toBe(false);
    expect(selectionComplete({ arrivee: '2026-11-28', depart: '2026-11-30' }, contexte)).toBe(false);
    expect(selectionComplete({ arrivee: '2026-12-13', depart: '2026-12-13' }, contexte)).toBe(false);
  });

  it('selectionTenable : des dates rapportées devenues prises tombent', () => {
    expect(selectionTenable({ arrivee: '2026-12-08', depart: '2026-12-12' }, contexte)).toEqual({
      arrivee: '2026-12-08',
      depart: null,
    });
    expect(selectionTenable({ arrivee: '2026-12-11', depart: '2026-12-14' }, contexte)).toEqual(SELECTION_VIDE);
    expect(selectionTenable({ arrivee: '2026-12-13', depart: '2026-12-16' }, contexte)).toEqual({
      arrivee: '2026-12-13',
      depart: '2026-12-16',
    });
  });

  it('selectionTenable : une sélection vide est tenable telle quelle (même référence : rien n’a « changé »)', () => {
    const vide = { arrivee: null, depart: null };
    expect(selectionTenable(vide, contexte)).toBe(vide);
  });

  it('nombreDeNuits compte sans fuseau, changement d’heure compris', () => {
    expect(nombreDeNuits('2026-12-09', '2026-12-13')).toBe(4);
    expect(nombreDeNuits('2027-03-27', '2027-03-30')).toBe(3);
    expect(nombreDeNuits('2026-12-09', null)).toBe(0);
    expect(nombreDeNuits('2026-12-13', '2026-12-09')).toBe(0);
  });

  it('la grille commence le lundi : décembre 2026 commence un mardi', () => {
    const mois = grilleDuMois('2026-12-01');
    expect(mois.cases.slice(0, 2)).toEqual([null, '2026-12-01']);
    expect(mois.cases.filter(Boolean)).toHaveLength(31);
    // Novembre 2026 commence un dimanche : six cases vides.
    expect(grilleDuMois('2026-11-01').cases.indexOf('2026-11-01')).toBe(6);
  });
});
