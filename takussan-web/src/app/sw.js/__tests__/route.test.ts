// @vitest-environment node
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { GET } from '../route';
import { versionDuDeploiement } from '@/lib/pwa/version';
import { estCheminLocalisable } from '@/i18n/routing';
import { config, proxy } from '@/proxy';

/** TCK-598 (V18) — `/sw.js`, ses en-têtes, sa version, et ce que le proxy de langue en fait. */
describe('/sw.js', () => {
  it('sert du JavaScript jamais mis en cache HTTP, de portée racine', async () => {
    const reponse = GET();
    expect(reponse.headers.get('Content-Type')).toContain('application/javascript');
    expect(reponse.headers.get('Cache-Control')).toContain('no-cache');
    expect(reponse.headers.get('Service-Worker-Allowed')).toBe('/');
    const script = await reponse.text();
    expect(script).toContain("addEventListener('fetch'");
    expect(script).toContain('Internet bi dagg na');
  });

  it('la version vient de BUILD_SHA, puis du commit Vercel, puis de BUILD_ID', () => {
    const racine = mkdtempSync(path.join(tmpdir(), 'sw-'));
    mkdirSync(path.join(racine, '.next'));
    writeFileSync(path.join(racine, '.next', 'BUILD_ID'), 'build-42\n');

    expect(versionDuDeploiement({ BUILD_SHA: 'abc123' }, racine)).toBe('abc123');
    expect(versionDuDeploiement({ BUILD_SHA: 'inconnu', VERCEL_GIT_COMMIT_SHA: 'def' }, racine)).toBe('def');
    expect(versionDuDeploiement({ BUILD_SHA: 'inconnu' }, racine)).toBe('build-42');
    expect(versionDuDeploiement({}, path.join(racine, 'absent'))).toBe('dev');
  });
});

describe('proxy de langue — les fichiers de l\'application installable', () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each(['/sw.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-maskable-512.png'])(
    '%s n\'est ni localisable ni vu par le proxy',
    (chemin) => {
      expect(estCheminLocalisable(chemin)).toBe(false);
      expect(matcher.test(chemin)).toBe(false);
    },
  );

  it('la start_url `/` est redirigée vers la langue du visiteur (307), pas figée en /fr', () => {
    const en = proxy(new NextRequest('https://www.takussan.com/', { headers: { 'accept-language': 'en-US,en;q=0.9' } }));
    expect(en.status).toBe(307);
    expect(new URL(en.headers.get('location')!).pathname).toBe('/en');

    const sansIndice = proxy(new NextRequest('https://www.takussan.com/'));
    expect(new URL(sansIndice.headers.get('location')!).pathname).toBe('/fr');
  });
});
