import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_PROPERTY_FIELDS,
  archiveProperties,
  deleteProperty,
  fetchAdminProperties,
  postPropertyAction,
} from '../super-admin';

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

describe('TCK-132 — super-admin property queries', () => {
  it('fetchAdminProperties hits the proxy with sparse fields, agency filter and sort', async () => {
    const spy = mockFetch({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    });

    await fetchAdminProperties({
      search: 'studio',
      status: 'available',
      type: 'apartment',
      visibility: 'public',
      agencyId: 7,
      sort: '-price',
      page: 2,
      perPage: 30,
    });

    const url = String(spy.mock.calls[0][0]);
    expect(url.startsWith('/api/super-admin-properties')).toBe(true);
    expect(url).toContain(`fields%5Bproperties%5D=${ADMIN_PROPERTY_FIELDS.join('%2C')}`);
    expect(url).toContain('include=address%2Cagency');
    expect(url).toContain('filter%5Bsearch%5D=studio');
    expect(url).toContain('filter%5Bstatus%5D=available');
    expect(url).toContain('filter%5Btype%5D=apartment');
    expect(url).toContain('filter%5Bvisibility%5D=public');
    expect(url).toContain('filter%5Bagency_id%5D=7');
    expect(url).toContain('sort=-price');
    expect(url).toContain('page=2');
    expect(url).toContain('per_page=30');
  });

  it('fetchAdminProperties defaults to per_page=20, sort -created_at when not provided', async () => {
    const spy = mockFetch({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    });

    await fetchAdminProperties();

    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('sort=-created_at');
    expect(url).toContain('per_page=20');
    expect(url).toContain('page=1');
  });

  it('postPropertyAction posts to /publish or /unpublish on the proxy', async () => {
    const spy = mockFetch({ ok: true });
    await postPropertyAction(42, 'publish');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/super-admin-properties/42/publish');
    expect(init?.method).toBe('POST');
  });

  it('archiveProperties posts the bulk-archive payload', async () => {
    const spy = mockFetch({ archived: 2, failed: 0, archived_ids: [1, 2] });
    await archiveProperties([1, 2], 'cleanup');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/super-admin-properties/bulk-archive');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ property_ids: [1, 2], reason: 'cleanup' });
  });

  it('deleteProperty issues a DELETE on the proxy', async () => {
    const spy = mockFetch(null, true, 204);
    await deleteProperty(99);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/super-admin-properties/99');
    expect(init?.method).toBe('DELETE');
  });
});
