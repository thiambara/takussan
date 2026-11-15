/** TCK-2621 — `patchActiveProfile` envoie `remember` quand l'appelant le donne, et rien sinon. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequest = vi.fn();
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

import { patchActiveProfile } from '@/lib/profiles';

beforeEach(() => apiRequest.mockReset().mockResolvedValue({ data: {} }));

describe('patchActiveProfile', () => {
  it('avec remember', async () => {
    await patchActiveProfile('t', 'owner:9', false);
    expect(apiRequest).toHaveBeenCalledWith('/api/me/active-profile', expect.objectContaining({ body: { profile_id: 'owner:9', remember: false } }));
  });

  it('sans remember : le corps d’avant, l’API applique son défaut', async () => {
    await patchActiveProfile('t', 'owner:9');
    expect(apiRequest).toHaveBeenCalledWith('/api/me/active-profile', expect.objectContaining({ body: { profile_id: 'owner:9' } }));
  });
});
