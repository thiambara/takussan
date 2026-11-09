import { describe, it, expect, beforeEach } from 'vitest';
import {
  RECHERCHES_RECENTES_MAX,
  RECHERCHES_RECENTES_VUES_CLE,
  effacerRecherchesRecentes,
  lireRecherchesRecentes,
  lireVuesDesRecherches,
  retenirRecherche,
} from '../recherches-recentes';

/**
 * TCK-2497 — la date de dernière visite de chaque récente, d'où l'écran tire « N nouveaux depuis
 * votre dernière visite ». À part de la liste `{texte, qs}`, que d'autres lisent telle quelle.
 */
beforeEach(() => window.localStorage.clear());

const LUNDI = new Date('2026-11-02T09:00:00.000Z');
const MARDI = new Date('2026-11-03T09:00:00.000Z');

describe('les dates des récentes', () => {
  it('retenir une recherche la date ; la relancer avance SA date seulement', () => {
    retenirRecherche({ texte: 'villa', qs: 'type=villa' }, LUNDI);
    retenirRecherche({ texte: 'studio', qs: 'type=studio' }, LUNDI);
    retenirRecherche({ texte: 'villa', qs: 'type=villa' }, MARDI);
    expect(lireVuesDesRecherches()).toEqual({
      'type=villa': MARDI.toISOString(),
      'type=studio': LUNDI.toISOString(),
    });
    // La forme des récentes ne change pas.
    expect(lireRecherchesRecentes()).toEqual([
      { texte: 'villa', qs: 'type=villa' },
      { texte: 'studio', qs: 'type=studio' },
    ]);
  });

  it('une récente sortie de la liste perd sa date', () => {
    for (let i = 0; i <= RECHERCHES_RECENTES_MAX; i++) retenirRecherche({ texte: `r${i}`, qs: `q=r${i}` }, LUNDI);
    const vues = lireVuesDesRecherches();
    expect(Object.keys(vues)).toHaveLength(RECHERCHES_RECENTES_MAX);
    expect(vues['q=r0']).toBeUndefined();
  });

  it('une récente retenue AVANT ce ticket reste sans date (jamais une date inventée)', () => {
    window.localStorage.setItem('takussan.recherches-recentes', JSON.stringify([{ texte: 'terrain', qs: 'type=land' }]));
    retenirRecherche({ texte: 'villa', qs: 'type=villa' }, MARDI);
    expect(lireVuesDesRecherches()).toEqual({ 'type=villa': MARDI.toISOString() });
  });

  it('une date illisible est ignorée, et effacer les récentes efface leurs dates', () => {
    window.localStorage.setItem(RECHERCHES_RECENTES_VUES_CLE, JSON.stringify({ a: 'hier', b: 3, c: LUNDI.toISOString() }));
    expect(lireVuesDesRecherches()).toEqual({ c: LUNDI.toISOString() });
    window.localStorage.setItem(RECHERCHES_RECENTES_VUES_CLE, '[1,2]');
    expect(lireVuesDesRecherches()).toEqual({});
    retenirRecherche({ texte: 'villa', qs: 'type=villa' }, LUNDI);
    effacerRecherchesRecentes();
    expect(window.localStorage.getItem(RECHERCHES_RECENTES_VUES_CLE)).toBeNull();
  });
});
