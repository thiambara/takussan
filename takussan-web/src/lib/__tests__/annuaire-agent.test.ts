import { describe, expect, it } from 'vitest';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import { LANGUES_DE_L_ANNUAIRE } from '@/components/public/index/faits-de-profil';
import { MAX_QUARTIERS, basculerLangue, erreursAnnuaireAgent, quartiersRetenus } from '../annuaire-agent';

/** TCK-2524 — les règles du profil d'annuaire de l'agent, sans écran. */

const q = (id: number) => ({ id, name: `Q${id}` });

describe('quartiersRetenus — cinq au plus', () => {
  it('garde la liste proposée jusqu’à cinq, sans doublon', () => {
    expect(quartiersRetenus([], [q(1), q(2), q(1)])).toEqual([q(1), q(2)]);
    expect(quartiersRetenus([], [1, 2, 3, 4, 5].map(q))).toHaveLength(MAX_QUARTIERS);
  });

  it('refuse un sixième et rend la MÊME liste', () => {
    const cinq = [1, 2, 3, 4, 5].map(q);
    const apres = quartiersRetenus(cinq, [...cinq, q(6)]);
    expect(apres).toBe(cinq);
  });

  it('retirer reste possible à cinq', () => {
    const cinq = [1, 2, 3, 4, 5].map(q);
    expect(quartiersRetenus(cinq, cinq.slice(1))).toEqual([2, 3, 4, 5].map(q));
  });
});

describe('basculerLangue', () => {
  it('coche et décoche, dans l’ordre de la liste fermée', () => {
    expect(basculerLangue(['en'], 'fr', LANGUES_DE_L_ANNUAIRE)).toEqual(['fr', 'en']);
    expect(basculerLangue(['fr', 'wo'], 'fr', LANGUES_DE_L_ANNUAIRE)).toEqual(['wo']);
  });
});

describe('erreursAnnuaireAgent', () => {
  it('pose languages(.n) et neighborhood_ids(.n) sur leur champ, le reste à part', () => {
    expect(erreursAnnuaireAgent({ 'languages.1': ['L'], neighborhood_ids: ['N'], autre: ['A'] })).toEqual({
      langues: 'L',
      quartiers: 'N',
      autres: ['A'],
    });
  });
});

describe('chaque langue de la liste fermée a son libellé dans la console', () => {
  it.each(LANGUES_DE_L_ANNUAIRE)('%s', (code) => {
    expect(fr.profile.agentDirectory.languageNames).toHaveProperty(code);
    expect(en.profile.agentDirectory.languageNames).toHaveProperty(code);
  });
});
