import { afterEach, describe, expect, it, vi } from 'vitest';

import { TAG_ADMIN_FIELDS, fetchTags, createTag } from '../tags';
import { AGENCY_ADMIN_FIELDS, fetchAgency } from '../agencies';
import {
  SETTING_ADMIN_FIELDS,
  INTEGRATION_ADMIN_FIELDS,
  fetchSettings,
  fetchIntegrations,
  testIntegration,
} from '../settings';

function mockFetch(response: unknown, ok = true, status = 200) {
  const spy = vi.fn(async () => ({
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('admin query builders — spatie conventions', () => {
  it('tags list uses sparse fields + default sort', async () => {
    const spy = mockFetch({ data: [], meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 } });
    await fetchTags('tok', { filters: { type: 'amenity' } });
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain(`fields%5Btags%5D=${TAG_ADMIN_FIELDS.join('%2C')}`);
    expect(url).toContain('filter%5Btype%5D=amenity');
    expect(url).toContain('sort=name');
  });

  it('agency show uses sparse fields', async () => {
    const spy = mockFetch({ data: { id: 1, name: 'x', slug: 'x' } });
    await fetchAgency('tok', 1);
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain(`fields%5Bagencies%5D=${AGENCY_ADMIN_FIELDS.join('%2C')}`);
  });

  it('settings list uses sparse fields + scope filter', async () => {
    const spy = mockFetch({ data: [], meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 } });
    await fetchSettings('tok', { scope: 'global' });
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain(`fields%5Bsettings%5D=${SETTING_ADMIN_FIELDS.join('%2C')}`);
    expect(url).toContain('filter%5Bscope%5D=global');
  });

  it('integrations list uses sparse fields', async () => {
    const spy = mockFetch({ data: [], meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 } });
    await fetchIntegrations('tok');
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain(`fields%5Bintegrations%5D=${INTEGRATION_ADMIN_FIELDS.join('%2C')}`);
  });

  it('creates a tag via POST with the trimmed payload', async () => {
    const spy = mockFetch({ data: { id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' } });
    await createTag('tok', { name: 'Piscine', type: 'amenity' });
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api/tags');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ name: 'Piscine', type: 'amenity' });
  });

  it('tests an integration via POST to /integrations/:id/test', async () => {
    const spy = mockFetch({ data: { ok: true, message: 'ok' } });
    const res = await testIntegration('tok', 7);
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('/api/integrations/7/test');
    expect(init?.method).toBe('POST');
    expect(res).toEqual({ ok: true, message: 'ok' });
  });
});
