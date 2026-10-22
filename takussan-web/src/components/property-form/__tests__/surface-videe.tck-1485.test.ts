import { describe, expect, it } from 'vitest';

import { propertyFormSchema } from '@/lib/schemas/property';
import { toUpdatePayload, withClearedFields } from '../payload';

/**
 * TCK-1485 (P149.04) — vider la surface d'un bien en édition l'efface.
 *
 * Mesuré le 2026-10-22 : `area` était un `z.coerce.number().positive()`, et `z.coerce` lit le `''`
 * d'un champ vidé comme `0` → refus `validation.property.areaPositive`. L'API accepte `null`.
 */
const BASE = { title: 'Appartement à Mermoz', type: 'apartment', price: 300_000, city: 'Dakar', contract_type: 'rent', rent_period: 'monthly' };

describe('surface vidée (TCK-1485)', () => {
  it('`area: ""` passe le schéma, sans valeur', () => {
    const r = propertyFormSchema.safeParse({ ...BASE, area: '' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.area).toBeUndefined();
  });

  it('vidée et modifiée en édition → `area: null` dans le corps', () => {
    const v = propertyFormSchema.parse({ ...BASE, area: '' });
    const corps = JSON.parse(JSON.stringify(withClearedFields(toUpdatePayload(v), v, { area: true })));
    expect(corps).toHaveProperty('area', null);
  });

  it('une surface saisie garde ses bornes', () => {
    expect(propertyFormSchema.parse({ ...BASE, area: '85' }).area).toBe(85);
    expect(propertyFormSchema.safeParse({ ...BASE, area: '0' }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...BASE, area: '12.5' }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...BASE, area: '2000000' }).success).toBe(false);
  });
});
