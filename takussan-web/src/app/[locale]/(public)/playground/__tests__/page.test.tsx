import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-794 (P18.06, décision du porteur) — `/playground` est retiré des environnements déployés : il
 * appelle la recherche publique pour ses rangées, et chaque affichage comptait des impressions
 * sponsorisées qu'il ne montre pas. Il reste un outil de développement (`next dev`).
 */
vi.mock('next/font/google', () => {
  const police = () => ({ variable: 'police' });
  return { Manrope: police, Inter: police, Fraunces: police };
});
vi.mock('../PlaygroundClient', () => ({ PlaygroundClient: () => null }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));

import PlaygroundPage from '../page';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/playground — hors des environnements déployés (TCK-794)', () => {
  it('une construction de production rend 404', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => PlaygroundPage()).toThrow('NOT_FOUND');
  });

  it('en développement, la page se rend toujours', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(PlaygroundPage()).toBeTruthy();
  });
});
