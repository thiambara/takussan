#!/usr/bin/env node
// Construit le « paquet » que le convertisseur design-sync consomme (cfg.buildCmd).
// takussan-web est une application Next, pas une bibliothèque : il n'a ni dist/ ni .d.ts. Ce script
// en fabrique l'équivalent, SANS rien réimplémenter — tout pointe vers les sources réelles :
//
//   1. node_modules  → lien vers takussan-web/node_modules (une seule copie de chaque dépendance) ;
//   2. messages      → sous-arbres `ui` et `common.actions` des trois locales ;
//   3. types/        → déclarations émises par tsc, alias `@/` réécrits en chemins relatifs
//                      (le convertisseur lit les .d.ts sans tsconfig) ;
//   4. dist/takussan.css → Tailwind 4 compilé depuis globals.css sur les sources du produit.
//
// Usage, depuis la racine du dépôt : node .design-sync/entry/build.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const WEB = join(REPO, 'takussan-web');
const WEB_NM = join(WEB, 'node_modules');
if (!existsSync(join(WEB_NM, 'react'))) {
  console.error('✗ takussan-web/node_modules absent — lancer `npm ci` dans takussan-web');
  process.exit(1);
}

// 1. node_modules
const link = join(HERE, 'node_modules');
if (!existsSync(link)) symlinkSync(relative(HERE, WEB_NM), link, 'dir');

// 2. messages
const pick = (m) => ({ ui: m.ui, common: { actions: m.common.actions } });
const msgs = Object.fromEntries(['fr', 'en', 'wo'].map((l) => [
  l, pick(JSON.parse(readFileSync(join(WEB, 'src/messages', `${l}.json`), 'utf8'))),
]));
writeFileSync(join(HERE, 'messages.generated.json'), JSON.stringify(msgs, null, 1) + '\n');
console.error('✓ messages : ui + common.actions × fr/en/wo');

// 3. types
rmSync(join(HERE, 'types'), { recursive: true, force: true });
try {
  execFileSync(join(WEB_NM, '.bin/tsc'), ['-p', join(HERE, 'tsconfig.json')], { stdio: 'inherit' });
} catch {
  // noEmitOnError=false : les déclarations sont émises même si le graphe importé porte des erreurs.
  console.error('! tsc a signalé des erreurs — déclarations émises quand même, vérifier ci-dessus');
}
const typesSrc = join(HERE, 'types/takussan-web/src');
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
let rewritten = 0;
for (const f of walk(join(HERE, 'types')).filter((p) => p.endsWith('.d.ts'))) {
  const src = readFileSync(f, 'utf8');
  const out = src.replace(/(from\s+|import\()(["'])@\/([^"']+)\2/g, (_, pre, q, p) => {
    let rel = relative(dirname(f), join(typesSrc, p));
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `${pre}${q}${rel}${q}`;
  });
  if (out !== src) { writeFileSync(f, out); rewritten++; }
}
if (!existsSync(join(HERE, 'types/.design-sync/entry/index.d.ts'))) {
  console.error('✗ types/.design-sync/entry/index.d.ts absent après tsc');
  process.exit(1);
}
console.error(`✓ types : alias @/ réécrits dans ${rewritten} fichiers`);

// 4. css
const req = createRequire(join(WEB, 'package.json'));
const postcss = req('postcss');
const tailwind = req('@tailwindcss/postcss');
const input = join(HERE, 'styles.css');
const result = await postcss([tailwind({ base: WEB, optimize: { minify: false } })])
  .process(readFileSync(input, 'utf8'), { from: input });
mkdirSync(join(HERE, 'dist'), { recursive: true });
const fonts = readFileSync(join(HERE, 'fonts/fonts.css'), 'utf8').replaceAll('url("./', 'url("../fonts/');
writeFileSync(join(HERE, 'dist/takussan.css'), `${fonts}\n${result.css}`);
console.error(`✓ css : dist/takussan.css (${Math.round(result.css.length / 1024)} Ko)`);
