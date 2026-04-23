import { describe, it, expect } from 'vitest';

import { documentUploadSchema, shareLinkSchema } from '../document';

describe('documentUploadSchema', () => {
  const base = {
    name: 'Contrat de bail',
    type: 'lease_contract' as const,
    documentable_type: 'lease' as const,
    documentable_id: 12,
    description: '',
    expiry_date: '',
  };

  it('accepts a minimal valid upload payload', () => {
    const result = documentUploadSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('rejects an empty name', () => {
    const result = documentUploadSchema.safeParse({ ...base, name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive documentable_id', () => {
    const result = documentUploadSchema.safeParse({ ...base, documentable_id: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown document type', () => {
    const result = documentUploadSchema.safeParse({ ...base, type: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid expiry_date format', () => {
    const result = documentUploadSchema.safeParse({
      ...base,
      expiry_date: '2026/04/23',
    });
    expect(result.success).toBe(false);
  });
});

describe('shareLinkSchema', () => {
  it('defaults ttl to 24h when omitted', () => {
    const result = shareLinkSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ttl).toBe('24h');
    }
  });

  it('rejects passwords shorter than 4 chars', () => {
    const result = shareLinkSchema.safeParse({ password: 'abc' });
    expect(result.success).toBe(false);
  });

  it('accepts a valid password and max_downloads', () => {
    const result = shareLinkSchema.safeParse({
      ttl: '7d',
      max_downloads: 5,
      password: 'secret',
    });
    expect(result.success).toBe(true);
  });
});
