// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ORIGINE_PRODUCTION,
  configPubliqueDuNavigateur,
  origineApi,
  origineMedia,
  origineSite,
  scriptDeConfigPublique,
  type ConfigPublique,
} from '../config-publique';

/**
 * ADR-0069 § 3 — une image par commit : la configuration se lit À L'EXÉCUTION.
 *
 * Environnement `node` : `window` n'existe pas, c'est le serveur. Le navigateur est simulé en
 * posant `window` à la main, comme le ferait le script du layout racine.
 *
 * Le contrat central est le premier `describe` : la valeur change quand l'environnement change
 * APRÈS l'import. Une constante de module — la forme d'avant, `const API_URL = …` — le rougit.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('lue à l’appel, jamais figée à l’import', () => {
  it('origineApi, origineMedia et origineSite suivent l’environnement posé après l’import', () => {
    vi.stubEnv('API_URL', 'https://preview.api.takussan.com');
    vi.stubEnv('SITE_URL', 'https://preview.takussan.com');
    vi.stubEnv('MEDIA_URL', 'https://media-preview.takussan.com');
    expect(origineApi()).toBe('https://preview.api.takussan.com');
    expect(origineSite()).toBe('https://preview.takussan.com');
    expect(origineMedia()).toBe('https://media-preview.takussan.com');

    vi.stubEnv('API_URL', 'https://api.takussan.com');
    vi.stubEnv('SITE_URL', 'https://www.takussan.com');
    vi.stubEnv('MEDIA_URL', 'https://media.takussan.com');
    expect(origineApi()).toBe('https://api.takussan.com');
    expect(origineSite()).toBe('https://www.takussan.com');
    expect(origineMedia()).toBe('https://media.takussan.com');
  });
});

describe('côté serveur', () => {
  it('la clé d’exécution gagne sur son repli NEXT_PUBLIC_* (Vercel, développement)', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://127.0.0.1:8002');
    vi.stubEnv('API_URL', 'https://preview.api.takussan.com');
    expect(origineApi()).toBe('https://preview.api.takussan.com');

    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://vercel.takussan.test');
    vi.stubEnv('SITE_URL', 'https://preview.takussan.com');
    expect(origineSite()).toBe('https://preview.takussan.com');
  });

  it('sans clé d’exécution, le repli NEXT_PUBLIC_* sert encore — le build de Vercel', () => {
    vi.stubEnv('API_URL', '');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.takussan.com/api');
    vi.stubEnv('MEDIA_URL', '');
    vi.stubEnv('NEXT_PUBLIC_MEDIA_URL', 'https://media.takussan.com');
    vi.stubEnv('SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.takussan.com');
    expect(origineApi()).toBe('https://api.takussan.com');
    expect(origineMedia()).toBe('https://media.takussan.com');
    expect(origineSite()).toBe('https://www.takussan.com');
  });

  it('retire le suffixe /api et la barre finale, comme les constantes qu’il remplace', () => {
    vi.stubEnv('API_URL', 'https://api.takussan.com/api');
    expect(origineApi()).toBe('https://api.takussan.com');
    vi.stubEnv('API_URL', 'https://api.takussan.com/');
    expect(origineApi()).toBe('https://api.takussan.com');
  });

  it('sans rien : le défaut de développement pour l’API, rien pour les médias, la production pour le site', () => {
    for (const cle of ['API_URL', 'NEXT_PUBLIC_API_URL', 'MEDIA_URL', 'NEXT_PUBLIC_MEDIA_URL', 'SITE_URL', 'NEXT_PUBLIC_SITE_URL', 'VERCEL_ENV', 'VERCEL_URL']) {
      vi.stubEnv(cle, '');
    }
    expect(origineApi()).toBe('http://localhost:8002');
    expect(origineMedia()).toBeUndefined();
    expect(origineSite()).toBe(ORIGINE_PRODUCTION);
  });

  it('une SITE_URL malformée ÉCHOUE en nommant la clé à corriger', () => {
    vi.stubEnv('SITE_URL', 'https://preview.takussan.com/site');
    expect(() => origineSite()).toThrow(/SITE_URL/);
  });
});

describe('côté navigateur', () => {
  it('lit la configuration que le layout a écrite, et non process.env', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8002');
    vi.stubEnv('API_URL', 'https://ignore.takussan.test');
    vi.stubGlobal('window', {
      __TAKUSSAN_CONFIG__: { apiUrl: 'https://preview.api.takussan.com', mediaUrl: 'https://media-preview.takussan.com' },
    });
    expect(origineApi()).toBe('https://preview.api.takussan.com');
    expect(origineMedia()).toBe('https://media-preview.takussan.com');
  });

  it('une mediaUrl vide vaut absence : le loader rend alors l’image source', () => {
    vi.stubEnv('NEXT_PUBLIC_MEDIA_URL', '');
    vi.stubGlobal('window', { __TAKUSSAN_CONFIG__: { apiUrl: 'https://api.takussan.com', mediaUrl: '' } });
    expect(origineMedia()).toBeUndefined();
  });

  it('sans configuration écrite, retombe sur NEXT_PUBLIC_* (inlinée par Vercel), jamais sur API_URL', () => {
    vi.stubEnv('API_URL', 'https://serveur-seulement.takussan.test');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.takussan.com');
    vi.stubGlobal('window', {});
    expect(origineApi()).toBe('https://api.takussan.com');
  });
});

describe('le script du layout racine', () => {
  function executer(script: string): ConfigPublique | undefined {
    const fenetre: { __TAKUSSAN_CONFIG__?: ConfigPublique } = {};
    new Function('window', script)(fenetre);
    return fenetre.__TAKUSSAN_CONFIG__;
  }

  it('transmet au navigateur l’API et les médias lus par le serveur', () => {
    vi.stubEnv('API_URL', 'https://preview.api.takussan.com');
    vi.stubEnv('MEDIA_URL', 'https://media-preview.takussan.com');
    expect(configPubliqueDuNavigateur()).toEqual({
      apiUrl: 'https://preview.api.takussan.com',
      mediaUrl: 'https://media-preview.takussan.com',
    });
    expect(executer(scriptDeConfigPublique())).toEqual(configPubliqueDuNavigateur());
  });

  it('ne laisse jamais une valeur fermer la balise <script>', () => {
    const config = { apiUrl: 'https://x.test/</script><script>alert(1)</script>', mediaUrl: '\u2028' };
    const script = scriptDeConfigPublique(config);
    expect(script).not.toContain('<');
    expect(script).not.toContain('\u2028');
    expect(executer(script)).toEqual(config);
  });
});
