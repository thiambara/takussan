/**
 * TCK-2931 — l'aperçu d'un bien à valider : l'introuvable se décide dans le layout du segment
 * (TCK-442). Un identifiant illisible, un 404 ou un 403 de la lecture de modération → introuvable ;
 * une panne → la page se rend et dit son erreur.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const { ApiError } = await import('@/lib/api');
const monter = async (id: string) => {
  const { default: Layout } = await import('../layout');
  return Layout({ params: Promise.resolve({ id }), children: React.createElement('p', null, 'enfant') });
};

// Entre accolades : une fonction RENDUE par `beforeEach` est appelée comme nettoyage après le test.
beforeEach(() => {
  apiRequestMock.mockReset();
});

describe('aperçu d’un bien à valider — layout', () => {
  it('un identifiant illisible : introuvable, sans appel', async () => {
    await expect(monter('abc')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(apiRequestMock).not.toHaveBeenCalled();
  });

  it('lit la modération du bien (`GET /api/properties/moderation/{id}`) et rend la page', async () => {
    apiRequestMock.mockResolvedValue({ data: { id: 12 } });
    await expect(monter('12')).resolves.toBeTruthy();
    expect(apiRequestMock).toHaveBeenCalledWith('/api/properties/moderation/12', { token: 'jeton' });
  });

  it.each([403, 404])('un %i de la lecture de modération : introuvable', async (status) => {
    apiRequestMock.mockImplementation(async () => {
      throw new ApiError(status, { message: 'non' });
    });
    await expect(monter('13')).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('une panne (500) n’est pas un introuvable', async () => {
    apiRequestMock.mockImplementation(async () => {
      throw new ApiError(500, { message: 'panne' });
    });
    await expect(monter('14')).resolves.toBeTruthy();
  });
});
