import { afterEach, describe, expect, it, vi } from 'vitest';

import { revokePlatformOperator } from '../super-admin';

afterEach(() => vi.unstubAllGlobals());

/** TCK-600 (ADR-0047) — le retrait d'un opérateur porte son motif (422 sans). */
describe('revokePlatformOperator', () => {
  it('poste le motif sur la route du retrait', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: {} })));
    vi.stubGlobal('fetch', fetchMock);

    await revokePlatformOperator(9, 'Départ de l’équipe.');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/super-admin/super-admins/9/revoke');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Départ de l’équipe.' });
  });
});
