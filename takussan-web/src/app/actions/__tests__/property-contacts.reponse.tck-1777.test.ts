// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-1777 (P95.04) — `replacePropertyContactsAction` rend la liste que `PUT …/contacts` a écrite
 * (libellé rogné, `null` rendu vide), à la forme de l'éditeur. Elle ne rendait que `{ ok: true }`,
 * et l'écran gardait dans son cache la liste envoyée.
 */
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

import { replacePropertyContactsAction } from '../property-contacts';

describe('replacePropertyContactsAction — la réponse de l’API', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 11, label: 'Gardien', phone: '+221770000803', has_whatsapp: true, position: 0 },
              { id: 12, label: null, phone: '+221770000804', has_whatsapp: false, position: 1 },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rend les lignes écrites, et non celles envoyées', async () => {
    const r = await replacePropertyContactsAction(7, [
      { label: '  Gardien  ', phone: '+221770000803', has_whatsapp: true },
      { label: '   ', phone: '+221770000804', has_whatsapp: false },
    ]);

    expect(r).toEqual({
      ok: true,
      data: [
        { label: 'Gardien', phone: '+221770000803', has_whatsapp: true },
        { label: '', phone: '+221770000804', has_whatsapp: false },
      ],
    });
  });
});
