/**
 * TCK-2621 — le relais de `PATCH /api/me/active-profile` transmet `remember` (TCK-2620), qu'il perdait.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const patchActiveProfile = vi.fn();
vi.mock('@/lib/profiles', () => ({
  ACTIVE_PROFILE_COOKIE: 'active_profile_id',
  patchActiveProfile: (...args: unknown[]) => patchActiveProfile(...args),
}));

import { PATCH } from '../route';

const requete = (corps: unknown) =>
  new NextRequest('http://localhost/api/me/active-profile', {
    method: 'PATCH',
    body: JSON.stringify(corps),
    headers: { cookie: 'auth_token=jeton-de-test', 'content-type': 'application/json' },
  });

beforeEach(() => {
  patchActiveProfile.mockReset();
  patchActiveProfile.mockResolvedValue({ data: { id: 'owner:9' } });
});

describe('relais de la bascule d’espace', () => {
  it('remember: true et remember: false arrivent tels quels à l’API', async () => {
    await PATCH(requete({ profile_id: 'owner:9', remember: true }));
    expect(patchActiveProfile).toHaveBeenLastCalledWith('jeton-de-test', 'owner:9', true);
    await PATCH(requete({ profile_id: 'owner:9', remember: false }));
    expect(patchActiveProfile).toHaveBeenLastCalledWith('jeton-de-test', 'owner:9', false);
  });

  it('sans remember : rien n’est inventé (l’API applique son défaut)', async () => {
    await PATCH(requete({ profile_id: 'owner:9' }));
    expect(patchActiveProfile).toHaveBeenLastCalledWith('jeton-de-test', 'owner:9', undefined);
  });

  it('un remember qui n’est pas un booléen est refusé avant l’API', async () => {
    const reponse = await PATCH(requete({ profile_id: 'owner:9', remember: 'oui' }));
    expect(reponse.status).toBe(422);
    expect(patchActiveProfile).not.toHaveBeenCalled();
  });

  it('le cookie du profil actif est posé, comme avant', async () => {
    const reponse = await PATCH(requete({ profile_id: 'owner:9', remember: false }));
    expect(reponse.cookies.get('active_profile_id')?.value).toBe('owner:9');
  });
});
