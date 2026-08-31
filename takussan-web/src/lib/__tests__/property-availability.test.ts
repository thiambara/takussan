import { describe, it, expect } from 'vitest';

import { disponibiliteDe } from '../property-availability';

const AUJOURDHUI = new Date('2026-08-30T10:00:00.000Z');

describe('disponibiliteDe (TCK-489)', () => {
  it('une date à venir en location est datée', () => {
    expect(
      disponibiliteDe(
        { type: 'apartment', contract_type: 'rent', available_from: '2026-09-15' },
        AUJOURDHUI,
      ),
    ).toEqual({ etat: 'datee', date: '2026-09-15' });
  });

  it('une date passée n’est pas une attente', () => {
    expect(
      disponibiliteDe(
        { type: 'apartment', contract_type: 'rent', available_from: '2020-01-01' },
        AUJOURDHUI,
      ),
    ).toEqual({ etat: 'immediate' });
  });

  it('le jour même est déjà disponible', () => {
    expect(
      disponibiliteDe(
        { type: 'apartment', contract_type: 'rent', available_from: '2026-08-30' },
        AUJOURDHUI,
      ),
    ).toEqual({ etat: 'immediate' });
  });

  it('une vente ne dit rien, même avec une date renseignée', () => {
    expect(
      disponibiliteDe(
        { type: 'apartment', contract_type: 'sale', available_from: '2026-09-15' },
        AUJOURDHUI,
      ),
    ).toBeNull();
  });

  it('un contrat absent n’est pas une location', () => {
    expect(
      disponibiliteDe({ type: 'apartment', available_from: '2026-09-15' }, AUJOURDHUI),
    ).toBeNull();
  });

  it('une clé nulle et une clé absente rendent la même chose : rien', () => {
    expect(
      disponibiliteDe({ type: 'apartment', contract_type: 'rent', available_from: null }, AUJOURDHUI),
    ).toBeNull();
    expect(disponibiliteDe({ type: 'apartment', contract_type: 'rent' }, AUJOURDHUI)).toBeNull();
  });

  it('une valeur qui n’est pas une date calendaire ne rend rien plutôt qu’une date inventée', () => {
    expect(
      disponibiliteDe(
        { type: 'apartment', contract_type: 'rent', available_from: 'bientôt' },
        AUJOURDHUI,
      ),
    ).toBeNull();
  });
});
