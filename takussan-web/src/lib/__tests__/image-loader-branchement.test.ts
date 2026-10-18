import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-540, TCK-860 — le loader de Cloudflare se branche pour tout `next build` (`NODE_ENV=production`,
 * posée par Next avant de lire sa configuration), jamais sous `next dev`.
 *
 * L'image Docker est le seul build qui serve : un build sans loader y ferait encoder chaque photo
 * par le conteneur (512 Mio). `next.config.ts` lit `NODE_ENV` à l'import, d'où le rechargement du
 * module à chaque cas.
 */
async function chargerConfig() {
  vi.resetModules();
  return (await import('../../../next.config')).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('next.config.ts — branchement du loader', () => {
  it('sous next build : le loader de Cloudflare remplace l’optimiseur, sans connaître l’origine du seau', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MEDIA_URL', '');
    const config = await chargerConfig();
    expect(config.images?.loader).toBe('custom');
    expect(config.images?.loaderFile).toBe('./src/lib/image-loader.ts');
  });

  it('sous next dev : l’optimiseur de Next reste', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const config = await chargerConfig();
    expect(config.images?.loader).toBeUndefined();
    expect(config.images?.loaderFile).toBeUndefined();
  });

  it('la sortie est standalone, quel que soit l’environnement de build', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect((await chargerConfig()).output).toBe('standalone');
  });

  it('accepte le domaine de médias dans remotePatterns', async () => {
    const hotes = (await chargerConfig()).images?.remotePatterns?.map((p) => ('hostname' in p ? p.hostname : ''));
    expect(hotes).toEqual(expect.arrayContaining(['media-preview.takussan.com', 'media.takussan.com']));
  });
});
