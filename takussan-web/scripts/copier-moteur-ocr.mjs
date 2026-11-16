#!/usr/bin/env node
/**
 * TCK-2899 — copie le moteur d'OCR du coffre sous `public/ocr/`, pour qu'il soit servi par NOTRE
 * origine et jamais par un CDN tiers à l'exécution (une pièce d'identité ne quitte pas l'appareil, et
 * rien de la page ne doit dépendre d'un tiers pour la lire — `src/lib/documents/lecture-mrz/moteur.ts`).
 *
 *   public/ocr/worker.min.js             ← tesseract.js/dist/worker.min.js
 *   public/ocr/core/tesseract-core-*-lstm.wasm.js   ← tesseract.js-core (le wasm y est embarqué)
 *   public/ocr/lang/eng.traineddata.gz   ← @tesseract.js-data/eng/4.0.0_best_int
 *
 * Lancé par `prebuild` et `predev` (pas `postinstall` : l'étape `deps` du Dockerfile n'a que
 * `package.json` et le lock). `public/ocr/` est ignoré par git : ~14 Mo dérivés de node_modules.
 * Les versions sont celles du lock — la copie suit donc toute montée de version.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(racine, 'node_modules');
const cible = join(racine, 'public', 'ocr');

const COPIES = [
  ['tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];

let manquants = 0;
for (const [source, destination] of COPIES) {
  const de = join(modules, source);
  if (!existsSync(de)) {
    console.error(`✗ copier-moteur-ocr : ${source} absent de node_modules (npm ci ?)`);
    manquants++;
    continue;
  }
  const vers = join(cible, destination);
  mkdirSync(dirname(vers), { recursive: true });
  copyFileSync(de, vers);
}
if (manquants > 0) process.exit(1);
console.log(`✓ moteur d'OCR copié sous public/ocr/ (${COPIES.length} fichiers)`);
