import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-633 — les équipements proposés hors catalogue (`tag_names`) partent par le MÊME appel que
 * les autres : `POST /api/properties/{id}/tags` (lu : `routes/api/properties.php`, POST et non PUT).
 */
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: api.apiRequest,
}));

import { setPropertyTags } from '../properties-server';

beforeEach(() => {
  api.apiRequest.mockReset();
  api.apiRequest.mockResolvedValue(undefined);
});

describe('setPropertyTags', () => {
  it('envoie les noms proposés à côté des identifiants', async () => {
    await setPropertyTags('jeton', 7, [1, 2], ['Forage']);

    expect(api.apiRequest).toHaveBeenCalledWith('/api/properties/7/tags', {
      method: 'POST',
      body: { tag_ids: [1, 2], tag_names: ['Forage'] },
      token: 'jeton',
    });
  });

  it('sans nom proposé, le corps reste celui d’avant', async () => {
    await setPropertyTags('jeton', 7, [1]);

    expect(api.apiRequest).toHaveBeenCalledWith('/api/properties/7/tags', {
      method: 'POST',
      body: { tag_ids: [1] },
      token: 'jeton',
    });
  });
});
