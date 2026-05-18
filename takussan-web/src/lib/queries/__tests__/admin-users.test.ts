import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ADMIN_USERS_FIELDS,
  fetchAdminUsers,
  postUserAction,
  putUserRole,
} from '../admin-users';

function mockFetch(response: unknown, ok = true, status = 200) {
  const fakeResponse = {
    ok,
    status,
    json: async () => response,
    text: async () => JSON.stringify(response),
  };
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

describe('TCK-133 — admin (agency-scoped) user queries', () => {
  it('fetchAdminUsers hits the proxy with sparse fields, polymorphic profile includes, no agency_id filter', async () => {
    const spy = mockFetch({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    });

    await fetchAdminUsers({
      search: 'amadou',
      status: 'active',
      role: 'agent',
      sort: '-last_login_at',
      page: 2,
      perPage: 30,
    });

    const url = String(spy.mock.calls[0][0]);
    expect(url.startsWith('/api/admin-users')).toBe(true);
    expect(url).toContain(`fields%5Busers%5D=${ADMIN_USERS_FIELDS.join('%2C')}`);
    expect(url).toContain('include=agentProfiles%2CownerProfiles%2CagencyAdminProfiles%2CplatformProfile');
    expect(url).toContain('filter%5Bsearch%5D=amadou');
    expect(url).toContain('filter%5Bstatus%5D=active');
    expect(url).toContain('filter%5Brole%5D=agent');
    expect(url).toContain('sort=-last_login_at');
    expect(url).toContain('page=2');
    expect(url).toContain('per_page=30');
    // Agency scope is server-side (TCK-147) — frontend must not send agency_id.
    expect(url).not.toContain('agency_id');
    // `type` column was dropped (TCK-142) — never request it.
    expect(url).not.toContain('filter%5Btype%5D');
    expect(url).not.toContain('type%2C');
  });

  it('defaults to per_page=20, sort=-created_at, page=1', async () => {
    const spy = mockFetch({
      data: [],
      meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 },
    });

    await fetchAdminUsers();

    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('sort=-created_at');
    expect(url).toContain('per_page=20');
    expect(url).toContain('page=1');
  });

  it('postUserAction posts to /block or /activate on the proxy', async () => {
    const spy = mockFetch({ data: { id: 7, status: 'banned' } });
    await postUserAction(7, 'block');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/admin-users/7/block');
    expect(init?.method).toBe('POST');

    await postUserAction(7, 'activate');
    const [url2, init2] = spy.mock.calls[1];
    expect(String(url2)).toBe('/api/admin-users/7/activate');
    expect(init2?.method).toBe('POST');
  });

  it('putUserRole PUTs the body { role } to the proxy', async () => {
    const spy = mockFetch({ data: { id: 7, role: 'agent', roles: ['agent'] } });
    await putUserRole(7, 'agent');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toBe('/api/admin-users/7/role');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({ role: 'agent' });
    expect((init?.headers as Record<string, string>)?.['Content-Type']).toBe('application/json');
  });

  it('putUserRole surfaces a 403 with target_user_not_in_active_agency message', async () => {
    mockFetch(
      { message: 'L’utilisateur cible n’appartient pas à votre agence active.' },
      false,
      403,
    );
    await expect(putUserRole(99, 'agent')).rejects.toMatchObject({
      status: 403,
      data: { message: expect.stringContaining('agence') },
    });
  });

  it('putUserRole surfaces a 422 when target has no resolvable agency', async () => {
    mockFetch(
      { message: 'The target user has no resolvable agency context.' },
      false,
      422,
    );
    await expect(putUserRole(99, 'agent')).rejects.toMatchObject({
      status: 422,
    });
  });
});
