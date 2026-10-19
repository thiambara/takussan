/**
 * `scripts/poids-des-routes.mjs` — TCK-947 (P33.05).
 *
 * Le script lit la sortie de `next build` ; ce test lui donne une sortie FACTICE, de la même forme
 * (manifestes et morceaux), et le lance comme la CI le lance : par `node`, en lisant son code de
 * sortie. Trois contrats :
 *
 *  · un rapport sans seuil — il imprime, par route publique, le JS initial gzip et les polices
 *    préchargées, et sort en 0 quel que soit le poids ;
 *  · un seul refus — `zod` dans le JS du layout racine sort en 1 (P33.02 l'en avait retiré) ; zod
 *    dans le JS d'une PAGE reste un chiffre du rapport, pas un refus ;
 *  · une mesure absente n'est pas un vert — sans sortie de build, ou sur une sortie illisible
 *    (manifeste tronqué, police nommée mais absente), le script sort en 2, jamais en 0 ni en 1 :
 *    1 est réservé au refus de zod.
 *
 * ⚠ L'entrée du layout racine porte DEUX morceaux, et zod va dans le SECOND : le build réel en met
 * sept, et un script qui ne lirait que le premier doit rougir ici (revue adverse de TCK-947).
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(__dirname, '../../../scripts/poids-des-routes.mjs');

/** Un morceau de zod 4 tel que Turbopack l'émet : le constructeur nommé par sa chaîne. */
const MORCEAU_ZOD = 'let ae=(e,t)=>{};const at=n.$constructor("$ZodError",ae);';

const dossiers: string[] = [];

afterEach(() => {
  for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true });
});

function ecrire(racine: string, relatif: string, contenu: string) {
  const cible = path.join(racine, relatif);
  mkdirSync(path.dirname(cible), { recursive: true });
  writeFileSync(cible, contenu);
}

function manifesteClient(cle: string, entrees: Record<string, string[]>) {
  return (
    'globalThis.__RSC_MANIFEST = globalThis.__RSC_MANIFEST || {};\n'
    + `globalThis.__RSC_MANIFEST[${JSON.stringify(cle)}] = ${JSON.stringify({ clientModules: {}, entryCSSFiles: {}, entryJSFiles: entrees })};\n`
  );
}

/** Une sortie `.next/` minimale : deux routes publiques, une route de la console. */
function sortieDeBuild(options: { layout?: string; page?: string } = {}): string {
  const racine = mkdtempSync(path.join(tmpdir(), 'poids-des-routes-'));
  dossiers.push(racine);
  ecrire(racine, 'build-manifest.json', JSON.stringify({ rootMainFiles: ['static/chunks/cadre.js'] }));
  ecrire(
    racine,
    'app-path-routes-manifest.json',
    JSON.stringify({
      '/[locale]/(public)/page': '/[locale]',
      '/[locale]/(public)/legal/page': '/[locale]/legal',
      '/(dashboard)/app/page': '/app',
    }),
  );
  const layout = { '[project]/src/app/layout': ['static/chunks/layout-1.js', 'static/chunks/layout-2.js'] };
  ecrire(
    racine,
    'server/app/[locale]/(public)/page_client-reference-manifest.js',
    manifesteClient('/[locale]/(public)/page', { ...layout, '[project]/src/app/[locale]/(public)/page': ['static/chunks/accueil.js'] }),
  );
  ecrire(
    racine,
    'server/app/[locale]/(public)/legal/page_client-reference-manifest.js',
    manifesteClient('/[locale]/(public)/legal/page', layout),
  );
  ecrire(
    racine,
    'server/next-font-manifest.json',
    JSON.stringify({ app: { '[project]/src/app/[locale]/(public)/page': ['static/media/bricolage.woff2'] } }),
  );
  ecrire(racine, 'static/chunks/cadre.js', 'x'.repeat(4000));
  ecrire(racine, 'static/chunks/layout-1.js', 'const cadre = 1;');
  ecrire(racine, 'static/chunks/layout-2.js', options.layout ?? 'const layout = 1;');
  ecrire(racine, 'static/chunks/accueil.js', options.page ?? 'const accueil = 2;');
  ecrire(racine, 'static/media/bricolage.woff2', 'w'.repeat(2048));
  return racine;
}

function lancer(dossier: string) {
  const r = spawnSync(process.execPath, [SCRIPT, dossier], { encoding: 'utf8' });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}

describe('poids-des-routes.mjs — TCK-947', () => {
  it('rapporte chaque route publique, et seulement elles, sans seuil : sortie 0', () => {
    const { code, sortie } = lancer(sortieDeBuild());

    expect(code).toBe(0);
    expect(sortie).toContain('/[locale]/legal');
    expect(sortie).toMatch(/^\s*\/\[locale\]\s/m);
    expect(sortie).not.toContain('/app');
    // L'accueil précharge une police de 2 Kio ; la page légale aucune.
    expect(sortie).toMatch(/\/\[locale\]\s.*\b1 police.*2,0 Kio/);
  });

  it('refuse zod dans le JS du layout racine : sortie 1, et le morceau est nommé', () => {
    const { code, sortie } = lancer(sortieDeBuild({ layout: MORCEAU_ZOD }));

    expect(code).toBe(1);
    expect(sortie).toContain('static/chunks/layout-2.js');
  });

  it('zod dans le JS d’une page reste un chiffre du rapport : sortie 0', () => {
    const { code } = lancer(sortieDeBuild({ page: MORCEAU_ZOD }));

    expect(code).toBe(0);
  });

  it('sans sortie de build, aucune mesure n’est un vert : sortie 2', () => {
    const vide = mkdtempSync(path.join(tmpdir(), 'poids-des-routes-'));
    dossiers.push(vide);

    expect(lancer(vide).code).toBe(2);
  });

  it.each([
    ['un manifeste JSON tronqué', (racine: string) => ecrire(racine, 'app-path-routes-manifest.json', '{"/[locale]/(public)/page": "/[lo')],
    [
      'un manifeste client tronqué',
      (racine: string) => ecrire(racine, 'server/app/[locale]/(public)/legal/page_client-reference-manifest.js', 'globalThis.__RSC_MANIFEST["/[locale]/(public)/legal/page"] = {"entryJS'),
    ],
    ['une police nommée mais absente', (racine: string) => rmSync(path.join(racine, 'static/media/bricolage.woff2'))],
  ])('une sortie illisible (%s) sort en 2, sans pile, jamais en 1', (_cas, degrader) => {
    const racine = sortieDeBuild();
    degrader(racine);
    const { code, sortie } = lancer(racine);

    expect(code).toBe(2);
    expect(sortie).toContain('illisible');
    expect(sortie).not.toMatch(/^\s+at /m);
  });
});
