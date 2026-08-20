import { describe, it, expect } from 'vitest';

import fr from '@/messages/fr.json';
import {
  DOCUMENT_TYPE_ORDER,
  DOCUMENTABLE_FILTER_ORDER,
  DOCUMENTABLE_UPLOAD_ORDER,
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

/**
 * ⚠ TCK-292 (lot I) — les libellés ont quitté `constants.ts` pour
 * `documents.types.*` / `documents.entities.*`. La garde d'origine vérifiait que la
 * table locale couvrait bien tout l'enum ; elle vérifie désormais la MÊME chose à la
 * nouvelle source. Sans ce déplacement, un ordre d'affichage pourrait citer une valeur
 * sans clé, et l'écran rendrait le nom de la clé au lieu du libellé — en silence.
 */
describe('label dictionaries', () => {
  it('covers every documentable type offered by the filter and the upload dialog', () => {
    for (const value of DOCUMENTABLE_UPLOAD_ORDER) {
      expect(fr.documents.entities[value]).toBeTruthy();
    }
    for (const value of DOCUMENTABLE_FILTER_ORDER) {
      expect(DOCUMENTABLE_UPLOAD_ORDER).toContain(value);
    }
  });

  it('covers every document type', () => {
    for (const value of DOCUMENT_TYPE_ORDER) {
      expect(fr.documents.types[value]).toBeTruthy();
    }
    expect(DOCUMENT_TYPE_ORDER).toContain('lease_contract');
    expect(DOCUMENT_TYPE_ORDER).toContain('id_card');
    expect(DOCUMENT_TYPE_ORDER).toContain('other');
  });
});
