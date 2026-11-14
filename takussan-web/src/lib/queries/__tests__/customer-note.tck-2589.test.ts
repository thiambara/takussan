import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2589 (vérification C/C2, d2) — « Épingler » de la saisie du fil : la note naît épinglée. Le test
 * du fil double `createCustomerNote` ; sans celui-ci, un corps sans `pinned` (le nom que lit
 * `StoreCustomerNoteRequest`) laissait toute la suite verte, et la note naissait non épinglée sans rien dire.
 */
const api = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  apiRequest: api.apiRequest,
}));

import { createCustomerNote } from '../customers';

beforeEach(() => {
  api.apiRequest.mockReset();
  api.apiRequest.mockResolvedValue({ data: { id: 1 } });
});

function envoi(): { readonly chemin: string; readonly options: { method?: string; body?: unknown; token?: string } } {
  const [chemin, options] = api.apiRequest.mock.calls[0] as [string, { method?: string; body?: unknown; token?: string }];
  return { chemin, options };
}

describe('createCustomerNote', () => {
  it('épinglée : le corps porte pinned: true', async () => {
    await createCustomerNote('jeton', 7, 'Rappeler jeudi', true);
    const { chemin, options } = envoi();
    expect(chemin).toBe('/api/customers/7/notes');
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({ body: 'Rappeler jeudi', pinned: true });
    expect(options.token).toBe('jeton');
  });

  it('non épinglée : le texte seul, sans pinned', async () => {
    await createCustomerNote('jeton', 7, 'Rappeler jeudi');
    expect(envoi().options.body).toEqual({ body: 'Rappeler jeudi' });
  });
});
