import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RECHERCHES_RECENTES_CLE,
  RECHERCHES_RECENTES_MAX,
  effacerRecherchesRecentes,
  lireRecherchesRecentes,
  retenirRecherche,
} from '../recherches-recentes';

/**
 * TCK-2475 — les dernières recherches de l'APPAREIL : le stockage local, enveloppé de `try/catch`
 * (navigation privée, quota, stockage bloqué), au plus six, la plus récente en tête, sans doublon.
 * Rien ne part au serveur.
 */
describe('recherches récentes', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('la plus récente en tête, sans doublon de destination', () => {
    retenirRecherche({ texte: 'villa', qs: 'q=villa' });
    retenirRecherche({ texte: 'dakar', qs: 'city=Dakar' });
    retenirRecherche({ texte: 'villa', qs: 'q=villa' });
    expect(lireRecherchesRecentes().map((r) => r.texte)).toEqual(['villa', 'dakar']);
  });

  it(`au plus ${RECHERCHES_RECENTES_MAX}`, () => {
    for (let i = 0; i < 10; i += 1) retenirRecherche({ texte: `t${i}`, qs: `q=t${i}` });
    const recentes = lireRecherchesRecentes();
    expect(recentes).toHaveLength(RECHERCHES_RECENTES_MAX);
    expect(recentes[0]?.texte).toBe('t9');
    // Le plafond tient dans le STOCKAGE, pas seulement à la lecture : rien n'y grossit sans fin.
    expect(JSON.parse(window.localStorage.getItem(RECHERCHES_RECENTES_CLE) ?? '[]')).toHaveLength(RECHERCHES_RECENTES_MAX);
  });

  it('un texte vide n’est pas retenu', () => {
    retenirRecherche({ texte: '  ', qs: '' });
    expect(lireRecherchesRecentes()).toEqual([]);
  });

  it('effaçables', () => {
    retenirRecherche({ texte: 'villa', qs: 'q=villa' });
    effacerRecherchesRecentes();
    expect(lireRecherchesRecentes()).toEqual([]);
  });

  it('une valeur illisible ou d’une autre forme ne casse rien', () => {
    window.localStorage.setItem(RECHERCHES_RECENTES_CLE, '{pas du json');
    expect(lireRecherchesRecentes()).toEqual([]);
    window.localStorage.setItem(RECHERCHES_RECENTES_CLE, JSON.stringify([{ texte: 1 }, null, { texte: 'ok', qs: 'q=ok' }]));
    expect(lireRecherchesRecentes()).toEqual([{ texte: 'ok', qs: 'q=ok' }]);
  });

  it('un stockage qui lève (navigation privée, quota) ne casse rien', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('SecurityError'); });
    expect(() => retenirRecherche({ texte: 'villa', qs: 'q=villa' })).not.toThrow();
    expect(lireRecherchesRecentes()).toEqual([]);
    expect(() => effacerRecherchesRecentes()).not.toThrow();
  });
});
