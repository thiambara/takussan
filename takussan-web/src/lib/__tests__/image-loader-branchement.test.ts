import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-540 — le loader ne se branche QUE si `NEXT_PUBLIC_MEDIA_URL` est posée au build.
 *
 * `loader: 'custom'` désactive l'optimiseur de Next partout, Vercel compris. Vercel construit la
 * production sans la variable jusqu'à la phase F : un branchement inconditionnel y servirait chaque
 * photo en pleine taille, et rien ne le signalerait. `next.config.ts` lit la variable à l'import,
 * d'où le rechargement du module à chaque cas.
 */
async function chargerConfig() {
  vi.resetModules();
  return (await import('../../../next.config')).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('next.config.ts — branchement du loader', () => {
  it('sans NEXT_PUBLIC_MEDIA_URL (dev, Vercel) : l’optimiseur de Next reste', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_URL', '');
    const config = await chargerConfig();
    expect(config.images?.loader).toBeUndefined();
    expect(config.images?.loaderFile).toBeUndefined();
  });

  it('avec : le loader de Cloudflare remplace l’optimiseur', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_URL', 'https://media-preview.takussan.com');
    const config = await chargerConfig();
    expect(config.images?.loader).toBe('custom');
    expect(config.images?.loaderFile).toBe('./src/lib/image-loader.ts');
  });

  it.each(['https://media-preview.takussan.com/', 'https://media-preview.takussan.com/photos', 'media-preview.takussan.com'])(
    'refuse « %s » : le loader compare une origine exacte',
    async (valeur) => {
      vi.stubEnv('NEXT_PUBLIC_MEDIA_URL', valeur);
      await expect(chargerConfig()).rejects.toThrow(/NEXT_PUBLIC_MEDIA_URL/);
    },
  );

  it('accepte le domaine de médias dans remotePatterns', async () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_URL', '');
    const hotes = (await chargerConfig()).images?.remotePatterns?.map((p) => ('hostname' in p ? p.hostname : ''));
    expect(hotes).toEqual(expect.arrayContaining(['media-preview.takussan.com', 'media.takussan.com']));
  });
});
