import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2864 — les faits du bailleur : ses pièces ne se lisent que quand le PROFIL ACTIF est le
 * bailleur (l'encart mène à « Vos pièces », qui lit ce même profil), ses moyens de versement pour qui
 * a la rangée ; une lecture en échec rend `null` (rien n'en est déduit), une lecture inutile n'a pas lieu.
 */
const M = vi.hoisted(() => ({
  me: vi.fn(),
  profils: vi.fn(),
  apiRequest: vi.fn(),
}));
vi.mock('@/app/actions/auth', () => ({ getMeAction: M.me }));
vi.mock('@/app/actions/profiles', () => ({ getMyProfilesAction: M.profils }));
vi.mock('@/lib/api', () => ({ apiRequest: M.apiRequest }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

const { faitsDuSommaire } = await import('../faits-du-sommaire');

const user = (roles: string[]) => ({ id: 1, roles, active_profile_id: null });
const profils = (actif: string) => ({ ok: true, data: { data: [], meta: { active_profile_id: actif } } });

beforeEach(() => {
  vi.clearAllMocks();
  M.apiRequest.mockImplementation(async (chemin: string) =>
    chemin === '/api/me/pieces' ? { data: [{ code: 'cni', required: true, kind: 'file', state: 'missing' }] } : { data: [{ kind: 'bank_transfer' }] },
  );
});

describe('faitsDuSommaire — le bailleur (TCK-2864)', () => {
  it('profil actif bailleur : pièces et moyens de versement lus', async () => {
    M.me.mockResolvedValue(user(['owner', 'customer']));
    M.profils.mockResolvedValue(profils('owner:3'));
    const f = await faitsDuSommaire();
    expect(f.pieces).toEqual([{ code: 'cni', required: true, kind: 'file', state: 'missing' }]);
    expect(f.versements).toEqual([{ kind: 'bank_transfer' }]);
    expect(M.apiRequest).toHaveBeenCalledWith('/api/me/pieces', { token: 'jeton' });
  });

  it('profil actif agent (aussi bailleur) : les pièces ne sont pas lues', async () => {
    M.me.mockResolvedValue(user(['agent', 'owner']));
    M.profils.mockResolvedValue(profils('agent:4'));
    const f = await faitsDuSommaire();
    expect(f.pieces).toBeUndefined();
    expect(M.apiRequest).not.toHaveBeenCalledWith('/api/me/pieces', expect.anything());
  });

  it('un agent seul : ni pièces ni moyens de versement lus', async () => {
    M.me.mockResolvedValue(user(['agent', 'customer']));
    M.profils.mockResolvedValue(profils('agent:4'));
    const f = await faitsDuSommaire();
    expect(M.apiRequest).not.toHaveBeenCalled();
    expect('versements' in f).toBe(false);
  });

  it('une lecture en échec rend `null`', async () => {
    M.me.mockResolvedValue(user(['owner']));
    M.profils.mockResolvedValue(profils('owner:3'));
    M.apiRequest.mockRejectedValue(new Error('500'));
    const f = await faitsDuSommaire();
    expect(f.pieces).toBeNull();
    expect(f.versements).toBeNull();
  });
});
