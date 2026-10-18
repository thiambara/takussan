// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

/**
 * ADR-0069 § 3 — le conteneur du front REFUSE DE DÉMARRER sans sa configuration.
 *
 * `docker/demarrer.mjs` est rejoué tel que l'image le lance : copié dans un répertoire à côté d'un
 * `server.js`, exécuté par `node`. Le faux `server.js` écrit un témoin : l'avoir vu, c'est avoir
 * démarré le serveur.
 */
const SOURCE = path.resolve(__dirname, '../../../docker/demarrer.mjs');
const TEMOIN = 'serveur-demarre';

const repertoire = mkdtempSync(path.join(tmpdir(), 'demarrer-'));
copyFileSync(SOURCE, path.join(repertoire, 'demarrer.mjs'));
writeFileSync(path.join(repertoire, 'server.js'), `console.log(${JSON.stringify(TEMOIN)});\n`);

afterAll(() => rmSync(repertoire, { recursive: true, force: true }));

const VALIDE = {
  API_URL: 'https://preview.api.takussan.com',
  SITE_URL: 'https://preview.takussan.com',
  MEDIA_URL: 'https://media-preview.takussan.com',
};

function demarrer(env: Record<string, string>) {
  const r = spawnSync(process.execPath, ['demarrer.mjs'], {
    cwd: repertoire,
    // Rien n'est hérité : une clé du poste de développement ne doit pas faire passer le test.
    // `NODE_ENV` comme l'image le pose (Dockerfile, étape `runtime`).
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', ...env },
    encoding: 'utf8',
  });
  return { code: r.status, sortie: r.stdout, erreurs: r.stderr };
}

describe('docker/demarrer.mjs', () => {
  it('avec les trois origines : démarre le serveur', () => {
    const r = demarrer(VALIDE);
    expect(r.erreurs).toBe('');
    expect(r.code).toBe(0);
    expect(r.sortie).toContain(TEMOIN);
  });

  it.each(['API_URL', 'SITE_URL', 'MEDIA_URL'] as const)('sans %s : refuse, nomme la clé, ne démarre rien', (cle) => {
    const env: Record<string, string> = { ...VALIDE };
    delete env[cle];
    const r = demarrer(env);
    expect(r.code).toBe(1);
    expect(r.erreurs).toContain(`${cle} manquante`);
    expect(r.sortie).not.toContain(TEMOIN);
  });

  it('une valeur blanche vaut absence', () => {
    const r = demarrer({ ...VALIDE, SITE_URL: '   ' });
    expect(r.code).toBe(1);
    expect(r.erreurs).toContain('SITE_URL manquante');
  });

  it.each([
    ['MEDIA_URL', 'https://media-preview.takussan.com/'],
    ['SITE_URL', 'https://preview.takussan.com/site'],
    ['API_URL', 'preview.api.takussan.com'],
    ['API_URL', 'ftp://preview.api.takussan.com'],
  ])('refuse %s = « %s » : une ORIGINE seule est attendue', (cle, valeur) => {
    const r = demarrer({ ...VALIDE, [cle]: valeur });
    expect(r.code).toBe(1);
    expect(r.erreurs).toContain(cle);
    expect(r.sortie).not.toContain(TEMOIN);
  });

  it('nomme TOUTES les clés fautives d’un coup, pas la première seulement', () => {
    const r = demarrer({});
    expect(r.code).toBe(1);
    for (const cle of Object.keys(VALIDE)) expect(r.erreurs).toContain(`${cle} manquante`);
  });
});
