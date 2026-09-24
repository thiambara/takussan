import { describe, expect, it } from 'vitest';

import {
  FORMULAIRE_UPGRADE_VIERGE,
  brouillonUpgradeEstVierge,
  formulaireUpgradeDepuisBrouillon,
} from '@/lib/agency-upgrade-brouillon';

/**
 * TCK-566 — ce que le SERVEUR rend pour un formulaire envoyé vide : le
 * middleware `ConvertEmptyStringsToNull` de l'API a changé chaque `''` en
 * `null` (mesuré : PUT `{ rc: '' … }`, puis GET → `{ rc: null … }`).
 */
const VIDE_TEL_QUE_STOCKE = {
  rc: null,
  ninea: null,
  rib_pro: null,
  address_fiscale: null,
  company_legal_name: null,
  planned_agents_count: null,
};

describe('formulaireUpgradeDepuisBrouillon — TCK-566', () => {
  it('relit un brouillon stocké vide comme le formulaire vierge, sans aucun null dans les champs texte', () => {
    expect(formulaireUpgradeDepuisBrouillon(VIDE_TEL_QUE_STOCKE)).toEqual(FORMULAIRE_UPGRADE_VIERGE);
  });

  it('garde les saisies, écarte les clés inconnues et les types inattendus', () => {
    expect(
      formulaireUpgradeDepuisBrouillon({
        ...VIDE_TEL_QUE_STOCKE,
        rc: 'RC-9',
        ninea: 12,
        planned_agents_count: 4,
        ancien_champ: 'x',
      }),
    ).toEqual({ ...FORMULAIRE_UPGRADE_VIERGE, rc: 'RC-9', planned_agents_count: 4 });
  });

  it('un contenu qui n’est pas un objet redevient le formulaire vierge', () => {
    for (const brut of [null, undefined, 'x', 3, ['rc']]) {
      expect(formulaireUpgradeDepuisBrouillon(brut)).toEqual(FORMULAIRE_UPGRADE_VIERGE);
    }
  });
});

describe('brouillonUpgradeEstVierge — TCK-566', () => {
  it('vrai pour le brouillon fantôme tel que le serveur le rend, et pour sa forme client', () => {
    expect(brouillonUpgradeEstVierge(VIDE_TEL_QUE_STOCKE)).toBe(true);
    expect(brouillonUpgradeEstVierge(FORMULAIRE_UPGRADE_VIERGE)).toBe(true);
    expect(brouillonUpgradeEstVierge({})).toBe(true);
  });

  it('faux dès qu’un champ porte une saisie', () => {
    expect(brouillonUpgradeEstVierge({ ...VIDE_TEL_QUE_STOCKE, ninea: '0' })).toBe(false);
    expect(brouillonUpgradeEstVierge({ ...VIDE_TEL_QUE_STOCKE, planned_agents_count: 2 })).toBe(false);
  });
});
