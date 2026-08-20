import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DASHBOARD_PROPERTY_FIELDS,
  DASHBOARD_PROPERTY_DETAIL_FIELDS,
  fetchDashboardProperties,
  fetchDashboardProperty,
  assignPropertyAgent,
  updatePropertyStatus,
  updatePropertyVisibility,
} from '../properties';
import {
  DASHBOARD_CUSTOMER_FIELDS,
  fetchDashboardCustomers,
  validateCustomerDocumentFile,
  CUSTOMER_DOCUMENT_REJECTION_NAMESPACE,
} from '../customers';

import { boundsToString, propertiesQueryKeys } from '@/lib/queries/properties';
import fr from '@/messages/fr.json';

function mockFetch(response: unknown, ok = true, status = 200) {
  const fakeResponse = {
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  };
  // Typing the mock as `typeof fetch` keeps `spy.mock.calls[0]` as the real
  // `[input, init?]` tuple instead of `never[]`, so destructuring + property
  // access in assertions type-checks under `tsc --noEmit`.
  const spy = vi.fn(
    async (..._args: Parameters<typeof fetch>): Promise<unknown> => fakeResponse,
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchDashboardProperties — spatie conventions', () => {
  it('always requests sparse fields + default sort', async () => {
    const fetchSpy = mockFetch({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
    await fetchDashboardProperties('tok', {});
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain(`fields%5Bproperties%5D=${DASHBOARD_PROPERTY_FIELDS.join('%2C')}`);
    expect(url).toContain('sort=-created_at');
    expect(url).toContain('per_page=20');
  });

  it('forwards filters as spatie filter[...] params', async () => {
    const fetchSpy = mockFetch({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
    await fetchDashboardProperties('tok', {
      filters: {
        status: 'available',
        search: 'villa',
        city: 'Dakar',
        user_id: '7',
        price_min: '100000',
        price_max: '500000',
        created_from: '2026-05-01',
        created_to: '2026-05-31',
      },
    });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('filter%5Bstatus%5D=available');
    expect(url).toContain('filter%5Bsearch%5D=villa');
    expect(url).toContain('filter%5Bcity%5D=Dakar');
    expect(url).toContain('filter%5Buser_id%5D=7');
    expect(url).toContain('filter%5Bprice_min%5D=100000');
    expect(url).toContain('filter%5Bprice_max%5D=500000');
    expect(url).toContain('filter%5Bcreated_from%5D=2026-05-01');
    expect(url).toContain('filter%5Bcreated_to%5D=2026-05-31');
    expect(url).toContain('include=address%2Cowner%2Ccollaborators');
  });
});

describe('fetchDashboardProperty', () => {
  it('requests the detail sparse fieldset and unwraps { data }', async () => {
    const fetchSpy = mockFetch({ data: { id: 5, title: 'Villa' } });
    const result = await fetchDashboardProperty('tok', 5);
    expect(result).toEqual({ id: 5, title: 'Villa' });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain(
      `fields%5Bproperties%5D=${DASHBOARD_PROPERTY_DETAIL_FIELDS.join('%2C')}`,
    );
  });
});

describe('property lifecycle mutations', () => {
  it('calls the status transition endpoint', async () => {
    const fetchSpy = mockFetch({ data: { id: 5, status: 'archived' } });
    await updatePropertyStatus('tok', 5, 'archived');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/properties/5/status'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ status: 'archived' }),
      }),
    );
  });

  it('calls the visibility transition endpoint', async () => {
    const fetchSpy = mockFetch({ data: { id: 5, visibility: 'public' } });
    await updatePropertyVisibility('tok', 5, 'public');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/properties/5/visibility'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ visibility: 'public' }),
      }),
    );
  });

  it('calls the assigned agent endpoint', async () => {
    const fetchSpy = mockFetch({ data: { id: 5, user_id: 9 } });
    await assignPropertyAgent('tok', 5, 9);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/properties/5/assigned-agent'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ user_id: 9 }),
      }),
    );
  });
});

describe('fetchDashboardCustomers — spatie conventions', () => {
  it('passes sparse customer fields and default sort', async () => {
    const fetchSpy = mockFetch({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
    await fetchDashboardCustomers('tok', {});
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain(`fields%5Bcustomers%5D=${DASHBOARD_CUSTOMER_FIELDS.join('%2C')}`);
    expect(url).toContain('sort=-created_at');
  });

  it('forwards the pipeline_stage filter', async () => {
    const fetchSpy = mockFetch({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
    await fetchDashboardCustomers('tok', {
      filters: { pipeline_stage: 'qualified' },
    });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('filter%5Bpipeline_stage%5D=qualified');
  });
});

describe('validateCustomerDocumentFile', () => {
  function makeFile(size: number, type: string): File {
    const blob = new Blob([new Uint8Array(size)], { type });
    return new File([blob], 'doc', { type });
  }

  it('rejects files larger than 10 Mo', () => {
    const file = makeFile(11 * 1024 * 1024, 'application/pdf');
    expect(validateCustomerDocumentFile(file)).toBe('tooLarge');
  });

  it('rejects unsupported mime types', () => {
    const file = makeFile(1024, 'application/zip');
    expect(validateCustomerDocumentFile(file)).toBe('unsupportedType');
  });

  /**
   * TCK-292 — le validateur rend un JETON ; c'est le dictionnaire qui porte le libellé. Un jeton
   * sans entrée rendrait la clé brute à l'écran, sans erreur ni test rouge. Ce test garde donc
   * l'accord, et fige les libellés français d'avant la conversion (AC3).
   */
  it('every rejection token resolves to its pre-conversion French label', () => {
    const table = (
      fr as unknown as { serverActions: { customerDocuments: Record<string, string> } }
    ).serverActions.customerDocuments;
    expect(CUSTOMER_DOCUMENT_REJECTION_NAMESPACE).toBe('serverActions.customerDocuments');
    expect(table).toEqual({
      tooLarge: 'Le fichier dépasse 10 Mo.',
      unsupportedType: 'Type de fichier non autorisé (images ou PDF uniquement).',
    });
  });

  it('accepts PDFs and images within the limit', () => {
    expect(validateCustomerDocumentFile(makeFile(1024, 'application/pdf'))).toBeNull();
    expect(validateCustomerDocumentFile(makeFile(1024, 'image/jpeg'))).toBeNull();
    expect(validateCustomerDocumentFile(makeFile(1024, 'image/png'))).toBeNull();
  });
});

describe('boundsToString', () => {
  it('serializes bounds to the backend-expected format', () => {
    expect(
      boundsToString({
        swLat: 14.6,
        swLng: -17.5,
        neLat: 14.8,
        neLng: -17.3,
      }),
    ).toBe('14.600000,-17.500000,14.800000,-17.300000');
  });

  it('keeps consistent precision for very close coordinates', () => {
    expect(
      boundsToString({
        swLat: 14.6928,
        swLng: -17.4467,
        neLat: 14.6929,
        neLng: -17.4466,
      }),
    ).toBe('14.692800,-17.446700,14.692900,-17.446600');
  });
});

describe('propertiesQueryKeys', () => {
  it('produces stable keys for the same params', () => {
    const a = propertiesQueryKeys.list({ filter: { featured: true } });
    const b = propertiesQueryKeys.list({ filter: { featured: true } });
    expect(a).toEqual(b);
  });

  it('differentiates map keys by bounds', () => {
    const a = propertiesQueryKeys.map('1,2,3,4', {});
    const b = propertiesQueryKeys.map('1,2,3,5', {});
    expect(a).not.toEqual(b);
  });
});
