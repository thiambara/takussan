// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-633 (lot C, tour 3) — le rejeu de la boîte « Avant de publier » est gardé jusqu'au CORPS de
 * la requête. Les tests des menus s'arrêtent au mock de l'action ; ici, c'est l'action elle-même :
 * `changePropertyStatusAction` doit envoyer `{status, accept_terms}` à `PUT …/status`, sans quoi le
 * « Publier » de la boîte, sur le chemin Statut, renverrait le même refus `[terms]` sans fin
 * (revérification 2, défaut 2 : ne pas l'envoyer laissait 1043 tests verts).
 */
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

import { ApiError } from '@/lib/api';
import { changePropertyStatusAction, publishPropertyAction } from '../publish-property';

describe('publication et statut — accept_terms jusqu’au corps de la requête', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue({ data: { id: 47, status: 'available' } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('le rejeu du menu Statut envoie {status, accept_terms: true} à PUT …/status', async () => {
    const resultat = await changePropertyStatusAction(47, 'available', { acceptTerms: true });

    expect(resultat).toEqual({ ok: true, data: { id: 47, status: 'available' } });
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith('/api/properties/47/status', {
      method: 'PUT',
      token: 'jeton',
      body: { status: 'available', accept_terms: true },
    });
  });

  it('le premier geste n’accepte rien : accept_terms vaut false', async () => {
    await changePropertyStatusAction(47, 'available', { acceptTerms: false });

    expect(apiRequestMock.mock.calls[0]![1]).toMatchObject({ body: { status: 'available', accept_terms: false } });
  });

  it('« Publier » envoie {accept_terms: true} à POST …/publish', async () => {
    await publishPropertyAction(47, { acceptTerms: true });

    expect(apiRequestMock).toHaveBeenCalledWith('/api/properties/47/publish', {
      method: 'POST',
      token: 'jeton',
      body: { accept_terms: true },
    });
  });

  it('un refus de coordonnées rend `missing` et `contactIsSelf`, pour que la boîte s’ouvre', async () => {
    apiRequestMock.mockRejectedValue(
      new ApiError(422, { code: 'property.publish_contact_incomplete', missing: ['terms'], contact_is_self: true, message: 'x' }),
    );

    const resultat = await changePropertyStatusAction(47, 'available', { acceptTerms: false });

    expect(resultat).toMatchObject({ ok: false, status: 422, missing: ['terms'], contactIsSelf: true });
  });
});
