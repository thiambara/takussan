import { describe, it, expect } from 'vitest';
import {
  searchFiltersSchema,
  savedSearchPayloadSchema,
} from '@/lib/schemas/search';

describe('searchFiltersSchema', () => {
  it('accepts a minimal empty object', () => {
    expect(searchFiltersSchema.parse({})).toEqual({});
  });

  it('coerces numeric query params from strings', () => {
    const parsed = searchFiltersSchema.parse({
      page: '3',
      per_page: '20',
      price_min: '50000',
      price_max: '250000',
      bedrooms: '2',
    });
    expect(parsed.page).toBe(3);
    expect(parsed.per_page).toBe(20);
    expect(parsed.price_min).toBe(50000);
    expect(parsed.price_max).toBe(250000);
    expect(parsed.bedrooms).toBe(2);
  });

  it('rejects out-of-range per_page', () => {
    expect(() =>
      searchFiltersSchema.parse({ per_page: '500' }),
    ).toThrow();
  });

  it('rejects unknown contract_type', () => {
    expect(() =>
      searchFiltersSchema.parse({ contract_type: 'lease' }),
    ).toThrow();
  });
});

describe('savedSearchPayloadSchema', () => {
  it('requires a non-empty name', () => {
    expect(() =>
      savedSearchPayloadSchema.parse({ name: '', criteria: {} }),
    ).toThrow();
  });

  it('defaults notification_frequency to off', () => {
    const parsed = savedSearchPayloadSchema.parse({
      name: 'Ma recherche',
      criteria: { city: 'Dakar' },
    });
    expect(parsed.notification_frequency).toBe('off');
  });

  it('accepts known notification frequencies', () => {
    const parsed = savedSearchPayloadSchema.parse({
      name: 'Dakar',
      criteria: {},
      notification_frequency: 'weekly',
    });
    expect(parsed.notification_frequency).toBe('weekly');
  });

  it('rejects unknown notification frequency', () => {
    expect(() =>
      savedSearchPayloadSchema.parse({
        name: 'x',
        criteria: {},
        notification_frequency: 'asap',
      }),
    ).toThrow();
  });
});
