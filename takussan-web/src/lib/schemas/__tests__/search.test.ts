import { describe, it, expect } from 'vitest';
import { savedSearchPayloadSchema } from '@/lib/schemas/search';

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
