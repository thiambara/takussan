import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

import { LANGUES_DE_L_ANNUAIRE, delaiDeReponse } from '../faits-de-profil';

/**
 * TCK-2521 — les deux règles d'une ligne d'annuaire qui ne se lisent pas au rendu.
 */
describe('delaiDeReponse — un délai honnête, ou rien', () => {
  it('null, non fini ou négatif : rien (décision 12 — jamais un chiffre flatteur)', () => {
    expect(delaiDeReponse(null)).toBeNull();
    expect(delaiDeReponse(undefined)).toBeNull();
    expect(delaiDeReponse(Number.POSITIVE_INFINITY)).toBeNull();
    expect(delaiDeReponse(Number.NaN)).toBeNull();
    expect(delaiDeReponse(-5)).toBeNull();
  });

  it('sous l’heure : en minutes, jamais « 0 min »', () => {
    expect(delaiDeReponse(0)).toEqual({ unite: 'minutes', valeur: 1 });
    expect(delaiDeReponse(7)).toEqual({ unite: 'minutes', valeur: 7 });
    expect(delaiDeReponse(59)).toEqual({ unite: 'minutes', valeur: 59 });
  });

  it('à partir d’une heure : en heures arrondies au plus proche', () => {
    expect(delaiDeReponse(60)).toEqual({ unite: 'heures', valeur: 1 });
    expect(delaiDeReponse(89)).toEqual({ unite: 'heures', valeur: 1 });
    expect(delaiDeReponse(90)).toEqual({ unite: 'heures', valeur: 2 });
    expect(delaiDeReponse(23 * 60 + 29)).toEqual({ unite: 'heures', valeur: 23 });
  });

  it('ce qui s’arrondit à 24 h et au-delà : en jours', () => {
    expect(delaiDeReponse(23 * 60 + 30)).toEqual({ unite: 'jours', valeur: 1 });
    expect(delaiDeReponse(36 * 60)).toEqual({ unite: 'jours', valeur: 2 });
  });
});

describe('LANGUES_DE_L_ANNUAIRE — le miroir de `config/directory.php`', () => {
  it('porte exactement les codes que l’API accepte', () => {
    const php = readFileSync(join(__dirname, '../../../../../../takussan-api/config/directory.php'), 'utf8');
    const ligne = /'languages'\s*=>\s*\[([^\]]*)\]/.exec(php);
    expect(ligne, '`languages` introuvable dans config/directory.php').not.toBeNull();
    const codes = [...ligne![1]!.matchAll(/'([a-z]{2,3})'/g)].map((m) => m[1]);
    expect([...LANGUES_DE_L_ANNUAIRE].sort()).toEqual(codes.sort());
  });

  it('chaque code a son libellé en français et en anglais', () => {
    for (const code of LANGUES_DE_L_ANNUAIRE) {
      expect((fr.publicProfileIndex.languages as Record<string, string>)[code], `fr ${code}`).toBeTruthy();
      expect((en.publicProfileIndex.languages as Record<string, string>)[code], `en ${code}`).toBeTruthy();
    }
  });
});
