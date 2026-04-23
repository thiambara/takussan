import { describe, it, expect } from 'vitest';

import {
  inventoryCreateSchema,
  inventoryDisputeSchema,
  inventoryElementSchema,
  inventoryRoomSchema,
} from '../inventory';

describe('inventoryElementSchema', () => {
  it('accepts valid French states', () => {
    for (const state of ['bon', 'usé', 'endommagé', 'manquant'] as const) {
      const result = inventoryElementSchema.safeParse({ label: 'Canapé', state });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown states', () => {
    const result = inventoryElementSchema.safeParse({ label: 'Canapé', state: 'bad' });
    expect(result.success).toBe(false);
  });

  it('requires a label', () => {
    const result = inventoryElementSchema.safeParse({ label: '', state: 'bon' });
    expect(result.success).toBe(false);
  });
});

describe('inventoryRoomSchema', () => {
  it('accepts a room without elements', () => {
    const result = inventoryRoomSchema.safeParse({
      name: 'Salon',
      condition: 'good',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a room with elements', () => {
    const result = inventoryRoomSchema.safeParse({
      name: 'Salon',
      condition: 'good',
      elements: [{ label: 'Canapé', state: 'bon' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid room condition', () => {
    const result = inventoryRoomSchema.safeParse({
      name: 'Salon',
      condition: 'nope',
    });
    expect(result.success).toBe(false);
  });
});

describe('inventoryCreateSchema', () => {
  const base = {
    lease_id: 1,
    type: 'move_in' as const,
    general_condition: 'good' as const,
    rooms: [{ name: 'Salon', condition: 'good' as const }],
  };

  it('accepts minimal valid payload', () => {
    const result = inventoryCreateSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('requires at least one room', () => {
    const result = inventoryCreateSchema.safeParse({ ...base, rooms: [] });
    expect(result.success).toBe(false);
  });

  it('coerces string lease_id', () => {
    const result = inventoryCreateSchema.safeParse({ ...base, lease_id: '12' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.lease_id).toBe(12);
  });

  it('rejects invalid type', () => {
    // Using `as never` to bypass typing — runtime validation is what we check.
    const result = inventoryCreateSchema.safeParse({ ...base, type: 'check_in' as never });
    expect(result.success).toBe(false);
  });
});

describe('inventoryDisputeSchema', () => {
  it('requires a reason', () => {
    const result = inventoryDisputeSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });

  it('accepts a non-empty reason', () => {
    const result = inventoryDisputeSchema.safeParse({ reason: 'Dégât non noté' });
    expect(result.success).toBe(true);
  });
});
