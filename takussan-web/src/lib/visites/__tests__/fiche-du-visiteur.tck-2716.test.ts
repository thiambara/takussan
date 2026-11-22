import { describe, expect, it } from 'vitest';

import { ficheDuVisiteur } from '../fiche-du-visiteur';

/**
 * TCK-2716 — le droit de faire une fiche d'une visite se lit dans `abilities.create_customer` (le
 * prédicat de `POST /api/customers`), jamais dans la carte du visiteur, champ d'affichage que
 * TCK-2717 servira au bailleur.
 */
const CARTE = { name: 'Mouhamed Fall', phone: '+221770001122', kind: 'anonymous' as const, visits_on_property: 1 };

describe('ficheDuVisiteur (TCK-2716)', () => {
  it('le droit et la carte : le prénom, le nom et le numéro de la carte', () => {
    expect(ficheDuVisiteur({ customer: null, visitor_display: CARTE, abilities: { manage: true, create_customer: true } })).toEqual({
      first_name: 'Mouhamed',
      last_name: 'Fall',
      phone: '+221770001122',
    });
  });

  it('la carte sans le droit : rien', () => {
    expect(ficheDuVisiteur({ customer: null, visitor_display: CARTE, abilities: { manage: false, create_customer: false } })).toBeUndefined();
    expect(ficheDuVisiteur({ customer: null, visitor_display: CARTE, abilities: { manage: true } })).toBeUndefined();
    expect(ficheDuVisiteur({ customer: null, visitor_display: CARTE })).toBeUndefined();
  });
});
