import { describe, expect, it } from 'vitest';
import {
  customerFormSchema,
  customerNoteSchema,
  normaliseCustomerForm,
} from '../customer';

const baseValues = {
  first_name: 'Amadou',
  last_name: 'Diop',
  email: '',
  phone: '',
  occupation: '',
  pipeline_stage: 'lead' as const,
  status: 'active' as const,
  id_type: '',
  id_number: '',
};

describe('customerFormSchema', () => {
  it('accepts a payload with a valid email', () => {
    const result = customerFormSchema.safeParse({
      ...baseValues,
      email: 'amadou@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a payload with a valid phone only', () => {
    const result = customerFormSchema.safeParse({
      ...baseValues,
      phone: '+221 77 123 45 67',
    });
    expect(result.success).toBe(true);
  });

  it('requires at least email or phone', () => {
    const result = customerFormSchema.safeParse(baseValues);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('email');
    }
  });

  it('rejects invalid email', () => {
    const result = customerFormSchema.safeParse({
      ...baseValues,
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('forces id_number when id_type is given', () => {
    const result = customerFormSchema.safeParse({
      ...baseValues,
      email: 'a@b.co',
      id_type: 'passport',
      id_number: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('id_number');
    }
  });
});

describe('normaliseCustomerForm', () => {
  it('converts empty strings to undefined in the payload', () => {
    const payload = normaliseCustomerForm({
      ...baseValues,
      email: 'Amadou@Example.com',
    });
    expect(payload.phone).toBeUndefined();
    expect(payload.occupation).toBeUndefined();
    expect(payload.id_type).toBeUndefined();
    expect(payload.id_number).toBeUndefined();
  });

  it('lowercases email', () => {
    const payload = normaliseCustomerForm({
      ...baseValues,
      email: 'Amadou@Example.com',
    });
    expect(payload.email).toBe('amadou@example.com');
  });

  it('keeps pipeline_stage and status verbatim', () => {
    const payload = normaliseCustomerForm({
      ...baseValues,
      email: 'a@b.co',
      pipeline_stage: 'qualified',
      status: 'inactive',
    });
    expect(payload.pipeline_stage).toBe('qualified');
    expect(payload.status).toBe('inactive');
  });
});

describe('customerNoteSchema', () => {
  it('rejects empty bodies', () => {
    expect(customerNoteSchema.safeParse({ body: '' }).success).toBe(false);
    expect(customerNoteSchema.safeParse({ body: '   ' }).success).toBe(false);
  });

  it('accepts any non-empty body', () => {
    expect(customerNoteSchema.safeParse({ body: 'Premier appel.' }).success).toBe(
      true,
    );
  });
});
