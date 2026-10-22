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

  it('does not force id_number when the record already holds one (TCK-953)', () => {
    const result = customerFormSchema.safeParse({
      ...baseValues,
      email: 'a@b.co',
      id_type: 'passport',
      id_number: '',
      id_number_masked: '•••• 8877',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(normaliseCustomerForm(result.data)).not.toHaveProperty('id_number_masked');
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

describe('locale — TCK-921', () => {
  it('rejects a language the API does not accept', () => {
    const result = customerFormSchema.safeParse({ ...baseValues, email: 'a@b.co', locale: 'de' });
    expect(result.success).toBe(false);
  });

  it('sends the chosen language, and null for the default', () => {
    expect(normaliseCustomerForm({ ...baseValues, email: 'a@b.co', locale: 'en' }).locale).toBe('en');
    expect(normaliseCustomerForm({ ...baseValues, email: 'a@b.co', locale: 'default' }).locale).toBeNull();
    expect(normaliseCustomerForm({ ...baseValues, email: 'a@b.co', locale: '' }).locale).toBeNull();
  });
});

/**
 * TCK-1347 (P149.02) — en édition, un champ de contact ou d'identité vidé part à `null` :
 * `blank()` le rendait `undefined`, que `apiRequest` laisse tomber, et l'API gardait la valeur.
 * `id_number` reste omis (le numéro masqué est gardé exprès).
 */
describe('normaliseCustomerForm — édition (TCK-1347)', () => {
  const initial = {
    ...baseValues,
    email: 'awa@example.com',
    phone: '+221771234567',
    occupation: 'Comptable',
    id_type: 'id_card',
    id_number: '',
  };

  it('vidés en édition, email, phone, occupation et id_type partent à null', () => {
    const payload = normaliseCustomerForm(
      { ...initial, email: '', phone: '', occupation: ' ', id_type: '', id_number: '' },
      initial,
    );
    expect(payload).toMatchObject({ email: null, phone: null, occupation: null, id_type: null });
    expect(payload.id_number).toBeUndefined();
  });

  it('un champ déjà vide et laissé vide n’est pas envoyé', () => {
    const vide = { ...initial, email: '', occupation: '', id_type: '' };
    const payload = normaliseCustomerForm(vide, vide);
    expect(payload.email).toBeUndefined();
    expect(payload.occupation).toBeUndefined();
    expect(payload.id_type).toBeUndefined();
  });

  it('en création (sans valeurs initiales), un champ vide reste omis', () => {
    const payload = normaliseCustomerForm({ ...initial, email: '', occupation: '' });
    expect(payload.email).toBeUndefined();
    expect(payload.occupation).toBeUndefined();
  });
});
