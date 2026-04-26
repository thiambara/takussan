import { describe, it, expect } from 'vitest';

import {
  agencyFormSchema,
  normaliseAgencyForm,
  validateAgencyLogoFile,
  AGENCY_LOGO_MAX_BYTES,
} from '../schemas/agency';
import { normaliseTagForm, tagFormSchema } from '../schemas/tag';
import {
  integrationFormSchema,
  normaliseIntegrationForm,
  parseSettingRawValue,
  stringifySettingValue,
} from '../schemas/setting';
import { renderSettingValue } from '../queries/settings';

/**
 * Admin admin-config schema tests — TCK-064 / TCK-066 / TCK-068.
 */

describe('agencyFormSchema', () => {
  const base = {
    name: 'Agence Sen Immo',
    license_number: '',
    description: '',
    email: '',
    phone: '',
    website: '',
    commission_rate: '',
    currency: '',
    timezone: '',
    // TCK-098 added this required boolean to the schema.
    moderation_required: false,
  };

  it('accepts minimal valid input', () => {
    const r = agencyFormSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('requires a name', () => {
    const r = agencyFormSchema.safeParse({ ...base, name: '   ' });
    expect(r.success).toBe(false);
  });

  it('rejects a commission rate outside [0, 100]', () => {
    const r = agencyFormSchema.safeParse({ ...base, commission_rate: '150' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('commission_rate'))).toBe(true);
    }
  });

  it('rejects a negative commission rate', () => {
    const r = agencyFormSchema.safeParse({ ...base, commission_rate: '-5' });
    expect(r.success).toBe(false);
  });

  it('accepts a commission rate in [0, 100]', () => {
    const r = agencyFormSchema.safeParse({ ...base, commission_rate: '7.5' });
    expect(r.success).toBe(true);
  });

  it('rejects invalid email/phone formats', () => {
    expect(agencyFormSchema.safeParse({ ...base, email: 'no-at-sign' }).success).toBe(false);
    expect(agencyFormSchema.safeParse({ ...base, phone: 'call me' }).success).toBe(false);
  });

  it('rejects invalid currency code', () => {
    expect(agencyFormSchema.safeParse({ ...base, currency: 'xof' }).success).toBe(false); // lowercase rejected
    expect(agencyFormSchema.safeParse({ ...base, currency: 'XOF' }).success).toBe(true);
  });

  it('normalises the payload: empty strings become null, commission goes to settings', () => {
    const payload = normaliseAgencyForm({
      ...base,
      name: '  Agence ABC  ',
      email: '  HELLO@Agence.SN ',
      commission_rate: '8',
      currency: 'xof',
    });
    expect(payload.name).toBe('Agence ABC');
    expect(payload.email).toBe('hello@agence.sn');
    expect(payload.commission_rate).toBe(8);
    // TCK-084 — `currency` is now a first-class column on top of being
    // mirrored under `settings.currency` for legacy callers.
    expect(payload.currency).toBe('XOF');
    expect(payload.settings).toMatchObject({
      default_commission_rate: 8,
      currency: 'XOF',
    });
  });
});

describe('validateAgencyLogoFile', () => {
  it('rejects files over the size cap', () => {
    const file = new File([new Uint8Array(AGENCY_LOGO_MAX_BYTES + 1)], 'big.png', {
      type: 'image/png',
    });
    expect(validateAgencyLogoFile(file)).toMatch(/2 Mo/);
  });

  it('rejects unsupported MIME types', () => {
    const file = new File([new Uint8Array(100)], 'bad.gif', { type: 'image/gif' });
    expect(validateAgencyLogoFile(file)).toMatch(/Format/);
  });

  it('accepts a PNG under the size cap', () => {
    const file = new File([new Uint8Array(1024)], 'ok.png', { type: 'image/png' });
    expect(validateAgencyLogoFile(file)).toBeNull();
  });
});

describe('tagFormSchema', () => {
  const base = {
    name: 'Piscine',
    type: 'amenity' as const,
    icon: '',
    color: '',
    description: '',
  };

  it('accepts a minimal amenity', () => {
    expect(tagFormSchema.safeParse(base).success).toBe(true);
  });

  it('requires a name', () => {
    expect(tagFormSchema.safeParse({ ...base, name: '' }).success).toBe(false);
  });

  it('validates the color when provided', () => {
    expect(tagFormSchema.safeParse({ ...base, color: 'bleu' }).success).toBe(false);
    expect(tagFormSchema.safeParse({ ...base, color: '#2563eb' }).success).toBe(true);
  });

  it('normalises empty optional fields to null', () => {
    const p = normaliseTagForm({ ...base, icon: '   ', color: '#fff', description: 'ok' });
    expect(p.icon).toBeNull();
    expect(p.color).toBe('#fff');
    expect(p.description).toBe('ok');
  });
});

describe('integrationFormSchema & normaliseIntegrationForm', () => {
  // TCK-102 — the schema gained SMS-specific fields (sms_client_id…
  // sms_host); they default to '' so existing call sites keep working,
  // but the IntegrationFormValues type now requires all of them.
  const base = {
    provider: 'wave',
    is_active: true,
    api_key: 'pk_test_123',
    api_secret: 'sk_test_abc',
    webhook_url: '',
    notes: '',
    sms_client_id: '',
    sms_client_secret: '',
    sms_sender_address: '',
    sms_sender_name: '',
    sms_username: '',
    sms_password: '',
    sms_sender_id: '',
    sms_service_id: '',
    sms_accountid: '',
    sms_host: '',
  };

  it('requires a provider', () => {
    expect(integrationFormSchema.safeParse({ ...base, provider: ' ' }).success).toBe(false);
  });

  it('normalises credentials into a sub-object on create', () => {
    const p = normaliseIntegrationForm(base, 'create');
    expect(p.credentials).toMatchObject({ api_key: 'pk_test_123', api_secret: 'sk_test_abc' });
  });

  it('drops credentials when editing without new secrets (never overwrites the stored secret)', () => {
    const p = normaliseIntegrationForm(
      { ...base, api_key: '', api_secret: '' },
      'edit',
    );
    expect(p.credentials).toBeUndefined();
  });

  it('validates the webhook URL format when provided', () => {
    expect(integrationFormSchema.safeParse({ ...base, webhook_url: 'not-url' }).success).toBe(false);
    expect(
      integrationFormSchema.safeParse({ ...base, webhook_url: 'https://ok.sn/hook' }).success,
    ).toBe(true);
  });

  it('encapsulates notes into metadata', () => {
    const p = normaliseIntegrationForm({ ...base, notes: 'prod account' }, 'create');
    expect(p.metadata).toEqual({ notes: 'prod account' });
  });
});

describe('setting value helpers', () => {
  it('parses booleans, numbers and strings', () => {
    expect(parseSettingRawValue('true')).toEqual({ value: true });
    expect(parseSettingRawValue('42')).toEqual({ value: 42 });
    expect(parseSettingRawValue('bonjour')).toEqual({ value: 'bonjour' });
  });

  it('parses JSON objects directly', () => {
    expect(parseSettingRawValue('{"enabled": true}')).toEqual({ enabled: true });
  });

  it('stringifies scalars wrapped under `value`', () => {
    expect(stringifySettingValue({ value: true })).toBe('true');
    expect(stringifySettingValue({ value: 'hello' })).toBe('hello');
    expect(stringifySettingValue({ value: null })).toBe('');
  });

  it('renders nested objects for display', () => {
    expect(renderSettingValue({ enabled: true })).toBe('{"enabled":true}');
    expect(renderSettingValue({ value: 7 })).toBe('7');
  });
});
