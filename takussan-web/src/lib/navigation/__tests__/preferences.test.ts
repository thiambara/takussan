import { describe, expect, it } from 'vitest';
import {
  NAVIGATION_VIDE,
  avecPersona,
  epinglesApresBascule,
  estParDefaut,
  lirePreferencesDeNavigation,
  prefsApresEpingle,
  prefsApresRepli,
  prefsDe,
  versLeCorps,
} from '../preferences';

const AGENT = { v: 1, personas: { agent: { epingles: ['commissions'] } } } as const;

describe('lirePreferencesDeNavigation — lu, jamais cru (TCK-2480)', () => {
  it('rend la navigation valide telle quelle', () => {
    expect(lirePreferencesDeNavigation(AGENT)).toEqual(AGENT);
  });

  it.each([undefined, null, 'menu', { v: 2, personas: {} }, { v: 1, personas: { courtier: {} } }])(
    'une forme inconnue vaut la disposition par défaut : %j',
    (brut) => {
      expect(lirePreferencesDeNavigation(brut)).toEqual(NAVIGATION_VIDE);
    },
  );

  it('`[]` (objet vide encodé par PHP) vaut `{}`, pour personas comme pour un persona', () => {
    expect(lirePreferencesDeNavigation({ v: 1, personas: [] })).toEqual(NAVIGATION_VIDE);
    expect(lirePreferencesDeNavigation({ v: 1, personas: { agent: [] } })).toEqual({ v: 1, personas: { agent: {} } });
  });
});

describe('le rangement par persona (AC2)', () => {
  it('le bailleur du même compte ne lit pas les épingles de l’agent', () => {
    expect(prefsDe(AGENT, 'agent').epingles).toEqual(['commissions']);
    expect(prefsDe(AGENT, 'bailleur')).toEqual({});
  });

  it('un geste chez le bailleur ne touche pas à l’agent', () => {
    const apres = avecPersona(AGENT, 'bailleur', { replies: ['activite'] });
    expect(apres).toEqual({ v: 1, personas: { agent: { epingles: ['commissions'] }, bailleur: { replies: ['activite'] } } });
  });

  it('un persona revenu au défaut quitte la navigation ; plus aucun persona → `null` envoyé', () => {
    const apres = avecPersona(AGENT, 'agent', { epingles: [], replies: [], demarrer_masque: false });
    expect(apres).toEqual(NAVIGATION_VIDE);
    expect(versLeCorps(apres)).toBeNull();
    expect(versLeCorps(AGENT)).toBe(AGENT);
  });

  it('estParDefaut', () => {
    expect(estParDefaut({})).toBe(true);
    expect(estParDefaut({ epingles: [], ouverts: [] })).toBe(true);
    expect(estParDefaut({ demarrer_masque: true })).toBe(false);
  });
});

describe('les gestes', () => {
  it('épingler ajoute en fin, désépingler retire ; à cinq, rien ne s’ajoute', () => {
    expect(epinglesApresBascule(['baux'], 'commissions')).toEqual(['baux', 'commissions']);
    expect(epinglesApresBascule(['baux', 'commissions'], 'baux')).toEqual(['commissions']);
    const cinq = ['a', 'b', 'c', 'd', 'e'];
    expect(epinglesApresBascule(cinq, 'f')).toEqual(cinq);
    expect(epinglesApresBascule(cinq, 'c')).toEqual(['a', 'b', 'd', 'e']);
  });

  it('revue (M2) — épingler déplie « Épinglés » s’il était replié, dans le même geste ; désépingler n’y touche pas', () => {
    const replie = { epingles: ['messagerie'], replies: ['epingles', 'gestion'] };
    expect(prefsApresEpingle(replie, ['messagerie'], 'commissions')).toEqual({
      epingles: ['messagerie', 'commissions'],
      replies: ['gestion'],
    });
    expect(prefsApresEpingle(replie, ['messagerie'], 'messagerie')).toEqual({
      epingles: [],
      replies: ['epingles', 'gestion'],
    });
    // À cinq, rien ne s'ajoute : rien ne se déplie non plus.
    const cinq = { epingles: ['a', 'b', 'c', 'd', 'e'], replies: ['epingles'] };
    expect(prefsApresEpingle(cinq, cinq.epingles, 'f')).toEqual(cinq);
  });

  it('un repli n’enregistre que l’ÉCART au défaut de la disposition', () => {
    // « Gestion » ouvert par défaut, replié par l'utilisateur.
    expect(prefsApresRepli({}, 'gestion', true, false)).toEqual({ replies: ['gestion'], ouverts: [] });
    // Rouvert : retour au défaut, plus rien d'enregistré.
    expect(prefsApresRepli({ replies: ['gestion'] }, 'gestion', false, false)).toEqual({ replies: [], ouverts: [] });
    // « Plus » replié par défaut, ouvert par l'utilisateur.
    expect(prefsApresRepli({}, 'plus', false, true)).toEqual({ replies: [], ouverts: ['plus'] });
  });

  it('vingt replis au plus : le plus ancien sort', () => {
    const vingt = Array.from({ length: 20 }, (_, i) => `g${i}`);
    expect(prefsApresRepli({ replies: vingt }, 'neuf', true, false).replies).toEqual([...vingt.slice(1), 'neuf']);
  });
});
