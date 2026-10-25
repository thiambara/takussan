import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2355 (P10.10) — `dangerouslyAllowSVG` et `dangerouslyAllowLocalIP` ne valent que pour
 * `next dev`, dont l'optimiseur sert les images de l'API locale (`127.0.0.1:8002`). Aucun build ne
 * les déclare : `next build` pose `NODE_ENV=production` avant de lire sa configuration, et sans
 * `contentSecurityPolicy` un SVG distant servi par l'optimiseur exécuterait ses scripts sur
 * l'origine du site.
 */
async function chargerConfig() {
  vi.resetModules();
  return (await import('../../../next.config')).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('next.config.ts — options dangerously* de next/image', () => {
  it('sous next build : ni SVG ni IP locale', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const images = (await chargerConfig()).images;
    expect(images?.dangerouslyAllowSVG).toBe(false);
    expect(images?.dangerouslyAllowLocalIP).toBe(false);
  });

  it('sous next dev : les deux restent, pour les images de l’API locale', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const images = (await chargerConfig()).images;
    expect(images?.dangerouslyAllowSVG).toBe(true);
    expect(images?.dangerouslyAllowLocalIP).toBe(true);
  });
});
