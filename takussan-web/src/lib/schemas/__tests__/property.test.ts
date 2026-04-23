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
