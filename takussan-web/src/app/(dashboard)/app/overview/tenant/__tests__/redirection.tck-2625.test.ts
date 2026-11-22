import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * TCK-2625 (AC4) — `/app/overview/tenant` rend une redirection vers `/app` : « Ma situation » est
 * absorbée par l'accueil du locataire et du client.
 *
 * Le second test garde la condition pour que ce soit une VRAIE redirection : un `loading.tsx` dans le
 * segment poserait une frontière de suspension, et le `redirect()` serait rendu en 200 au lieu de 307
 * (TCK-426).
 */
class RedirectionSimulee extends Error {
  constructor(readonly cible: string) {
    super(`NEXT_REDIRECT:${cible}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (cible: string) => {
    throw new RedirectionSimulee(cible);
  },
}));

describe('/app/overview/tenant — TCK-2625', () => {
  it('redirige vers l’accueil', async () => {
    const { default: Page } = await import('../page');
    let cible: string | null = null;
    try {
      Page();
    } catch (e) {
      if (e instanceof RedirectionSimulee) cible = e.cible;
      else throw e;
    }
    expect(cible).toBe('/app');
  });

  it('aucune frontière de suspension dans le segment : la redirection reste un 307', () => {
    expect(existsSync(resolve(__dirname, '../loading.tsx'))).toBe(false);
  });
});
