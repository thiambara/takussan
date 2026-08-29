import { describe, expect, it } from 'vitest';
import { createPropertyAction, updatePropertyAction } from '@/app/actions/dashboard-properties';
import type { PropertyFormPayload } from '@/lib/schemas/property';
import { toCreatePayload, toUpdatePayload } from '../payload';

/**
 * TCK-470 — la garde du TYPAGE des deux server actions, et non de leur comportement.
 *
 * Elle ne s'exécute pas : `@ts-expect-error` est vérifié par `npx tsc --noEmit`, qui ÉCHOUE si
 * l'erreur attendue ne se produit PAS. C'est ce qui la rend auto-vérifiante — un jour où le type
 * des actions redeviendrait plat (ou reprendrait une signature d'index `Record<string, unknown>`),
 * ces directives deviendraient inutilisées et le typecheck rougirait. Un test d'exécution, lui,
 * resterait vert : un cast ne change rien à ce qui court.
 *
 * Message obtenu au moment de l'écriture, sur les deux appels :
 *   error TS2345: Argument of type '{ title: string; … }' is not assignable to parameter of type
 *   'PropertyUpdatePayload'. … is not assignable to type 'ClesInterditesAuPremierNiveau'.
 *     Types of property 'city' are incompatible.
 *       Type 'string' is not assignable to type 'undefined'.
 *
 * ⚠ C'est LE défaut de TCK-464, nommé par le compilateur : `city` au premier niveau du corps,
 * là où `StorePropertyRequest` ne la déclare pas et où `validated()` la jetait en silence.
 */
declare const platComme_le_formulaire: PropertyFormPayload;

export function refusDuPayloadPlat() {
  return [
    // @ts-expect-error — un payload PLAT ne doit pas compiler (AC2) : `city` au premier niveau.
    updatePropertyAction(1, platComme_le_formulaire),
    // @ts-expect-error — idem à la création.
    createPropertyAction(platComme_le_formulaire),
  ];
}

/** Ce qui doit continuer de compiler : la sortie de `payload.ts`, imbriquée. */
export function acceptationDuPayloadImbrique() {
  return [
    updatePropertyAction(1, toUpdatePayload(platComme_le_formulaire)),
    createPropertyAction(toCreatePayload(platComme_le_formulaire, 'submit')),
  ];
}

describe('typage des server actions des biens (TCK-470)', () => {
  it('la garde vit dans `tsc --noEmit`, pas ici', () => {
    expect(typeof refusDuPayloadPlat).toBe('function');
    expect(typeof acceptationDuPayloadImbrique).toBe('function');
  });
});
