import { describe, it, expect } from 'vitest';

import {
  maintenanceCompleteSchema,
  maintenanceCreateSchema,
  maintenanceStatusSchema,
} from '../maintenance';

describe('maintenanceCreateSchema', () => {
  it('accepts a minimal valid payload', () => {
    const result = maintenanceCreateSchema.safeParse({
      property_id: 42,
      title: 'Fuite cuisine',
      description: 'Flaque sous évier',
      category: 'plumbing',
    });
    expect(result.success).toBe(true);
  });

  it('coerces string numeric ids from form inputs', () => {
    const result = maintenanceCreateSchema.safeParse({
      property_id: '42',
      lease_id: '7',
      title: 'Fuite cuisine',
      description: 'Flaque sous évier',
      category: 'plumbing',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.property_id).toBe(42);
      expect(result.data.lease_id).toBe(7);
    }
  });

  it('rejects missing title', () => {
    const result = maintenanceCreateSchema.safeParse({
      property_id: 42,
      title: '',
      description: 'desc',
      category: 'other',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown category', () => {
    const result = maintenanceCreateSchema.safeParse({
      property_id: 42,
      title: 't',
      description: 'd',
      category: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive property_id', () => {
    const result = maintenanceCreateSchema.safeParse({
      property_id: 0,
      title: 't',
      description: 'd',
      category: 'other',
    });
    expect(result.success).toBe(false);
  });
});

describe('maintenanceStatusSchema', () => {
  it('accepts a valid enum value', () => {
    const result = maintenanceStatusSchema.safeParse({ status: 'in_progress' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown statuses', () => {
    const result = maintenanceStatusSchema.safeParse({ status: 'foo' });
    expect(result.success).toBe(false);
  });
});

describe('maintenanceCompleteSchema', () => {
  it('coerces empty actual_cost to undefined', () => {
    const result = maintenanceCompleteSchema.safeParse({
      resolution_notes: 'ok',
      actual_cost: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actual_cost).toBeUndefined();
    }
  });

  it('rejects negative cost', () => {
    const result = maintenanceCompleteSchema.safeParse({
      actual_cost: -1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts numeric string costs', () => {
    const result = maintenanceCompleteSchema.safeParse({ actual_cost: '1500' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.actual_cost).toBe(1500);
  });
});
