import { describe, it, expect } from 'vitest';

import {
  DOCUMENT_TYPE_LABEL,
  DOCUMENTABLE_TYPE_LABEL,
  resolveDocumentableAlias,
  resolveDocumentableHref,
} from '../constants';

describe('resolveDocumentableAlias', () => {
  it('maps Laravel FQCN to short aliases', () => {
    expect(resolveDocumentableAlias('App\\Models\\Property')).toBe('property');
    expect(resolveDocumentableAlias('App\\Models\\Lease')).toBe('lease');
    expect(resolveDocumentableAlias('App\\Models\\Booking')).toBe('booking');
    expect(resolveDocumentableAlias('App\\Models\\Customer')).toBe('customer');
  });

  it('accepts bare aliases returned by some APIs', () => {
    expect(resolveDocumentableAlias('property')).toBe('property');
    expect(resolveDocumentableAlias('LEASE')).toBe('lease');
  });

  it('returns null for unknown or empty values', () => {
    expect(resolveDocumentableAlias(null)).toBeNull();
    expect(resolveDocumentableAlias('')).toBeNull();
    expect(resolveDocumentableAlias('App\\Models\\Foo')).toBeNull();
  });
});

describe('resolveDocumentableHref', () => {
  it('builds the dashboard link for a known alias', () => {
    expect(resolveDocumentableHref('property', 42)).toBe('/app/properties/42');
    expect(resolveDocumentableHref('lease', 7)).toBe('/app/leases/7');
    expect(resolveDocumentableHref('booking', 3)).toBe('/app/bookings/3');
    expect(resolveDocumentableHref('customer', 11)).toBe('/app/customers/11');
  });

  it('returns null when there is no dashboard page for the alias', () => {
    expect(resolveDocumentableHref('agency', 1)).toBeNull();
    expect(resolveDocumentableHref(null, 1)).toBeNull();
  });
});

describe('label dictionaries', () => {
  it('covers every documentable type', () => {
    for (const key of Object.keys(DOCUMENTABLE_TYPE_LABEL) as Array<
      keyof typeof DOCUMENTABLE_TYPE_LABEL
    >) {
      expect(DOCUMENTABLE_TYPE_LABEL[key]).toBeTruthy();
    }
  });

  it('covers every document type', () => {
    expect(DOCUMENT_TYPE_LABEL.lease_contract).toBeDefined();
    expect(DOCUMENT_TYPE_LABEL.id_card).toBeDefined();
    expect(DOCUMENT_TYPE_LABEL.other).toBeDefined();
  });
});
