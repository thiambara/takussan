import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../api';

const api = { apiRequest: vi.fn() };
// `platform-abilities` importe `./api` : le double vise ce module, par une enveloppe (comme
// `platform-abilities.double-facteur.test.ts`).
vi.mock('../../api', async (original) => ({
  ...(await original<typeof import('../../api')>()),
  apiRequest: (...args: unknown[]) => api.apiRequest(...args),
}));

const { accesALaConsole, consoleOuverte } = await import('../acces-console');

/** TCK-610 (AC6) — qui voit l'entrée de la console dans `/app`. */
describe('consoleOuverte', () => {
  it('un `viewer` : le geste `platform.console.access` ouvre l’entrée', () => {
    expect(consoleOuverte({ level: 'viewer', abilities: ['platform.console.access'] })).toBe(true);
  });

  it('sans le geste, ou sans opérateur (`null`) : pas d’entrée', () => {
    expect(consoleOuverte({ level: null, abilities: [] })).toBe(false);
    expect(consoleOuverte(null)).toBe(false);
  });

  it('un opérateur sans second facteur : l’entrée reste, la console le conduit à l’enrôlement', () => {
    expect(consoleOuverte({ doubleFacteur: 'two_factor_required' })).toBe(true);
  });
});

describe('accesALaConsole', () => {
  beforeEach(() => { api.apiRequest.mockReset(); });

  it('un `support` : lu à l’API, avec le jeton de la coque', async () => {
    api.apiRequest.mockResolvedValue({ data: { level: 'support', abilities: ['platform.console.access'] } });
    expect(await accesALaConsole({ roles: ['customer'] }, 'jeton')).toBe(true);
    expect(api.apiRequest).toHaveBeenCalledWith('/api/admin/me/abilities', { token: 'jeton' });
  });

  it('un client : 403 `super_admin_required` → pas d’entrée', async () => {
    api.apiRequest.mockRejectedValue(new ApiError(403, { code: 'auth.super_admin_required' }));
    expect(await accesALaConsole({ roles: ['customer'] }, 'jeton')).toBe(false);
  });

  it('un `viewer` sans 2FA : 403 `two_factor_required` → l’entrée reste', async () => {
    api.apiRequest.mockRejectedValue(new ApiError(403, { code: 'two_factor_required' }));
    expect(await accesALaConsole({ roles: ['customer'] }, 'jeton')).toBe(true);
  });

  it('une panne de l’API ferme l’entrée sans faire tomber la coque', async () => {
    api.apiRequest.mockRejectedValue(new ApiError(500, { message: 'Erreur serveur' }));
    expect(await accesALaConsole({ roles: ['customer'] }, 'jeton')).toBe(false);
  });

  it('le `super_admin` ne paie aucune lecture', async () => {
    expect(await accesALaConsole({ roles: ['customer', 'super_admin'] }, 'jeton')).toBe(true);
    expect(api.apiRequest).not.toHaveBeenCalled();
  });
});
