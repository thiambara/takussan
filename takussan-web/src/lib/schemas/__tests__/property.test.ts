import { describe, expect, it } from 'vitest';
import { propertyFormSchema } from '../property';

describe('propertyFormSchema', () => {
  const baseValid = {
    title: 'Villa Almadies',
    type: 'villa' as const,
    contract_type: 'rent' as const,
    price: 150_000,
    currency: 'XOF' as const,
    city: 'Dakar',
  };

  it('accepts a minimal valid payload', () => {
    const result = propertyFormSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
  });

  it('requires a title', () => {
    const result = propertyFormSchema.safeParse({ ...baseValid, title: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('title');
    }
  });

  it('requires a positive price', () => {
    const result = propertyFormSchema.safeParse({ ...baseValid, price: 0 });
    expect(result.success).toBe(false);
  });

  // TCK-564 — le prix se saisit dans `FormAmountInput`, qui remet un champ VIDÉ au formulaire en
  // `null`. `z.coerce.number` lisait `null` comme 0 : le testeur qui efface le prix lisait « Le
  // prix doit être supérieur à 0. » au lieu de « Le prix est requis. ».
  it.each([[null], [undefined], [''], ['   ']])('an emptied price (%j) is REQUIRED, not "must be > 0"', (price) => {
    const result = propertyFormSchema.safeParse({ ...baseValid, price });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'price');
      expect(issue?.message).toBe('validation.property.priceRequired');
    }
  });

  it('a zero price still says "must be > 0"', () => {
    const result = propertyFormSchema.safeParse({ ...baseValid, price: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('validation.property.pricePositive');
    }
  });

  it('requires a known type', () => {
    const result = propertyFormSchema.safeParse({
      ...baseValid,
      type: 'spaceship',
    });
    expect(result.success).toBe(false);
  });

  it('requires a known contract_type', () => {
    const result = propertyFormSchema.safeParse({
      ...baseValid,
      contract_type: 'lease',
    });
    expect(result.success).toBe(false);
  });

  it('coerces numeric strings for price/area', () => {
    const result = propertyFormSchema.safeParse({
      ...baseValid,
      price: '100000',
      area: '120',
      bedrooms: '3',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe(100000);
      expect(result.data.area).toBe(120);
      expect(result.data.bedrooms).toBe(3);
    }
  });

  it('drops empty optional strings', () => {
    const result = propertyFormSchema.safeParse({
      ...baseValid,
      quarter: '',
      description: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quarter).toBeUndefined();
      expect(result.data.description).toBeUndefined();
    }
  });
});
