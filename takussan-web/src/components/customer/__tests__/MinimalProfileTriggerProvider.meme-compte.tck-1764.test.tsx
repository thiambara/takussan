/**
 * TCK-1764 (P172.04) — `GET /api/me/welcome-seen` n'est pas relu quand `refreshUser()` remplace
 * l'objet `user` par le même compte.
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as AuthContext from '@/context/AuthContext';
import { MinimalProfileTriggerProvider } from '../MinimalProfileTriggerProvider';

function authAvec(user: unknown) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({ user, token: 'tk' } as unknown as ReturnType<
    typeof AuthContext.useAuth
  >);
}

describe('MinimalProfileTriggerProvider — même compte (TCK-1764)', () => {
  let reseau: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    reseau = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
    vi.stubGlobal('fetch', reseau);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('un nouvel objet pour le même compte ne relit pas les accueils vus', async () => {
    authAvec({ id: 1, roles: ['customer'] });
    const { rerender } = render(
      <MinimalProfileTriggerProvider roles={['customer']}>
        <span />
      </MinimalProfileTriggerProvider>,
    );
    await vi.waitFor(() => expect(reseau).toHaveBeenCalledTimes(1));

    authAvec({ id: 1, roles: ['customer'] });
    rerender(
      <MinimalProfileTriggerProvider roles={['customer']}>
        <span />
      </MinimalProfileTriggerProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(reseau).toHaveBeenCalledTimes(1);
  });
});
